// Rúbricas por reto (migración 0038): un grupo en el reto general y en el reto
// «Mujer» se evalúa una sola vez y cada reto calcula su propia nota.
// Todo se crea en un espacio temporal que se borra al terminar.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadTestEnv } from "./load-test-env.mjs";
import { combineScore, onePerJudge, rubricsForTeam } from "../src/lib/app/challenge-scoring.ts";

const env = loadTestEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const stamp = Date.now();
const userIds = [];
let eventId = null;
let failures = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function createUser(label) {
  const email = `scoring-${label}-${stamp}@test.local`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Prueba ${label}` },
  });
  if (error) throw error;
  userIds.push(data.user.id);
  await admin.from("profiles").update({ disabled: false }).eq("id", data.user.id);
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: loginError } = await client.auth.signInWithPassword({ email, password });
  if (loginError) throw loginError;
  return { id: data.user.id, client };
}

// ── 0. Cálculo puro ──────────────────────────────────────────────────────
const plus = { scoringMode: "general_plus", generalWeight: 60, rubricId: "r" };
check("General 80 + Mujer 90 con 60/40 → 84", combineScore(plus, 80, 90) === 84);
check("50/50 → 85", combineScore({ ...plus, generalWeight: 50 }, 80, 90) === 85);
check("Solo propios → 90", combineScore({ ...plus, scoringMode: "own" }, 80, 90) === 90);
check("Solo general → 80", combineScore({ ...plus, scoringMode: "general" }, 80, 90) === 80);
check("Sin rúbrica propia aún cuenta la general", combineScore({ ...plus, rubricId: null }, 80, 90) === 80);
check("Si falta una parte no hay nota mezclada", combineScore(plus, 80, null) === null);
check(
  "Un grupo en General y Mujer se evalúa con general + Mujer, sin repetir",
  rubricsForTeam("g", [{ scoringMode: "general", rubricId: null }, { scoringMode: "general_plus", rubricId: "m" }]).join() === "g,m",
);
check(
  "Si su único reto es «solo propios», no hace falta la general",
  rubricsForTeam("g", [{ scoringMode: "own", rubricId: "m" }]).join() === "m",
);
check(
  "Contar evaluaciones: una por grupo y jurado",
  onePerJudge([
    { team_id: "t", judge_id: "j", status: "submitted" },
    { team_id: "t", judge_id: "j", status: "submitted" },
  ]).length === 1,
);

try {
  const owner = await createUser("owner");
  const judge = await createUser("judge");
  const { data: created, error: createError } = await owner.client.rpc("create_event_space", {
    p_name: `Scoring ${stamp}`,
    p_slug: `scoring-${stamp}`,
    p_kind: "hackathon",
    p_signup_code: `SCO-${stamp}`,
    p_description: "Espacio temporal de integración",
    p_settings: {},
  });
  if (createError) throw createError;
  eventId = created;
  await admin.from("event_members").insert({ event_id: eventId, user_id: judge.id, role: "judge", status: "active" });

  // Rúbrica general con dos criterios (60 + 40).
  let { data: general } = await admin
    .from("rubrics")
    .select("id, scale_max")
    .eq("event_id", eventId)
    .eq("is_active", true)
    .maybeSingle();
  if (!general) {
    ({ data: general } = await admin
      .from("rubrics")
      .insert({ event_id: eventId, name: "General", is_active: true, scale_min: 1, scale_max: 5 })
      .select("id, scale_max")
      .single());
  }
  await admin.from("rubric_criteria").delete().eq("rubric_id", general.id);
  const { data: gCrit } = await admin
    .from("rubric_criteria")
    .insert([
      { rubric_id: general.id, title: "Innovación", weight: 60, order: 0 },
      { rubric_id: general.id, title: "Viabilidad", weight: 40, order: 1 },
    ])
    .select("id, title");

  // Retos: General (como siempre) y Mujer (general + propios, 60/40).
  const { data: challenges, error: chError } = await owner.client
    .from("challenges")
    .insert([
      { event_id: eventId, name: "General", scoring_mode: "general", general_weight: 60 },
      { event_id: eventId, name: "Mujer", scoring_mode: "general_plus", general_weight: 60 },
    ])
    .select("id, name, scoring_mode, general_weight");
  check("La gestión crea retos con su forma de puntuar", !chError, chError?.message);
  const generalCh = challenges.find((c) => c.name === "General");
  const mujer = challenges.find((c) => c.name === "Mujer");
  check("Por defecto un reto usa solo la rúbrica general", generalCh.scoring_mode === "general" && generalCh.general_weight === 60);

  const { error: badMode } = await owner.client.from("challenges").update({ scoring_mode: "inventado" }).eq("id", mujer.id);
  check("Una forma de puntuar inventada se rechaza", Boolean(badMode));
  const { error: badWeight } = await owner.client.from("challenges").update({ general_weight: 150 }).eq("id", mujer.id);
  check("Un peso fuera de 0–100 se rechaza", Boolean(badWeight));

  const { data: own, error: ownError } = await owner.client
    .from("rubrics")
    .insert({ event_id: eventId, challenge_id: mujer.id, name: "Mujer", is_active: false, scale_min: 1, scale_max: 5 })
    .select("id")
    .single();
  check("La gestión crea la rúbrica propia del reto", !ownError, ownError?.message);
  await owner.client.from("challenges").update({ rubric_id: own.id }).eq("id", mujer.id);
  const { error: dupOwn } = await owner.client
    .from("rubrics")
    .insert({ event_id: eventId, challenge_id: mujer.id, name: "Otra", is_active: false });
  check("Un reto solo tiene una rúbrica propia", Boolean(dupOwn));

  const { data: mCrit } = await admin
    .from("rubric_criteria")
    .insert([
      { rubric_id: own.id, title: "Igualdad", weight: 50, order: 0 },
      { rubric_id: own.id, title: "Liderazgo", weight: 50, order: 1 },
    ])
    .select("id, title");

  const { data: judgeRubric, error: judgeRubricError } = await judge.client
    .from("rubrics")
    .insert({ event_id: eventId, challenge_id: generalCh.id, name: "Del jurado", is_active: false })
    .select("id");
  check("El jurado no puede crear rúbricas de reto", Boolean(judgeRubricError) || !judgeRubric?.length);

  // Una empresa en los dos retos.
  const { data: team } = await admin
    .from("teams")
    .insert({ event_id: eventId, challenge_id: generalCh.id, name: "Empresa", number: 1 })
    .select("id")
    .single();
  await admin.from("team_challenges").insert({ team_id: team.id, challenge_id: mujer.id, event_id: eventId });

  // El jurado la evalúa una vez: una fila por rúbrica, como hace el formulario.
  const now = new Date().toISOString();
  const saveEval = async (rubricId) =>
    judge.client
      .from("evaluations")
      .upsert(
        { event_id: eventId, team_id: team.id, judge_id: judge.id, rubric_id: rubricId, status: "submitted", submitted_at: now },
        { onConflict: "team_id,judge_id,rubric_id" },
      )
      .select("id")
      .single();
  const { data: gEval, error: gEvalError } = await saveEval(general.id);
  const { data: mEval, error: mEvalError } = await saveEval(own.id);
  check("El jurado guarda la parte general", !gEvalError, gEvalError?.message);
  check("El jurado guarda la parte del reto Mujer", !mEvalError, mEvalError?.message);

  const by = (list, title) => list.find((c) => c.title === title).id;
  const { error: scoreError } = await judge.client.from("evaluation_scores").upsert(
    [
      { event_id: eventId, evaluation_id: gEval.id, criterion_id: by(gCrit, "Innovación"), score: 4 },
      { event_id: eventId, evaluation_id: gEval.id, criterion_id: by(gCrit, "Viabilidad"), score: 4 },
      { event_id: eventId, evaluation_id: mEval.id, criterion_id: by(mCrit, "Igualdad"), score: 5 },
      { event_id: eventId, evaluation_id: mEval.id, criterion_id: by(mCrit, "Liderazgo"), score: 4 },
    ],
    { onConflict: "evaluation_id,criterion_id" },
  );
  check("Las puntuaciones de las dos partes se guardan", !scoreError, scoreError?.message);

  const { error: mixed } = await judge.client.from("evaluation_scores").insert({
    event_id: eventId,
    evaluation_id: gEval.id,
    criterion_id: by(mCrit, "Igualdad"),
    score: 3,
  });
  check("Un criterio del reto no se puede colar en la evaluación general", Boolean(mixed));

  // Notas: general = (4/5)·60 + (4/5)·40 = 80; Mujer propia = (5/5)·50 + (4/5)·50 = 90.
  const generalScore = 80;
  const ownScore = 90;
  check("Reto General → 80", combineScore({ scoringMode: "general", generalWeight: 60, rubricId: null }, generalScore, ownScore) === 80);
  check(
    "Reto Mujer (60/40) → 84",
    combineScore({ scoringMode: "general_plus", generalWeight: 60, rubricId: own.id }, generalScore, ownScore) === 84,
  );

  // Borrar el reto borra su rúbrica propia.
  await admin.from("team_challenges").delete().eq("challenge_id", mujer.id);
  await admin.from("evaluations").delete().eq("rubric_id", own.id);
  await admin.from("challenges").delete().eq("id", mujer.id);
  const { data: gone } = await admin.from("rubrics").select("id").eq("id", own.id);
  check("Al borrar el reto desaparece su rúbrica propia", gone.length === 0);
} catch (error) {
  console.error(error);
  failures += 1;
} finally {
  if (eventId) await admin.from("events").delete().eq("id", eventId);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
}

if (failures) {
  console.error(`\n${failures} comprobación(es) fallida(s).`);
  process.exit(1);
}
console.log("\nRúbricas por reto: todo correcto.");

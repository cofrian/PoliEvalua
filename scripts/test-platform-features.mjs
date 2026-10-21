// Integración de los módulos configurables contra el proyecto Supabase enlazado.
// Todos los datos de esta prueba se crean en un espacio temporal y se eliminan.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [
        line.slice(0, separator).trim(),
        line.slice(separator + 1).trim().replace(/^"|"$/g, ""),
      ];
    }),
);

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const stamp = Date.now();
const userIds = [];
let eventId = null;
let failures = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function createUser(label) {
  const email = `features-${label}-${stamp}@test.local`;
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
  const client = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
  const { error: loginError } = await client.auth.signInWithPassword({ email, password });
  if (loginError) throw loginError;
  return { id: data.user.id, client };
}

try {
  const owner = await createUser("owner");
  const judge = await createUser("judge");
  const slug = `funciones-${stamp}`;
  const { data: created, error: createError } = await owner.client.rpc(
    "create_event_space",
    {
      p_name: `Funciones ${stamp}`,
      p_slug: slug,
      p_kind: "class",
      p_signup_code: `FUNC-${stamp}`,
      p_description: "Espacio temporal de integración",
      p_settings: {
        participant_mode: "groups",
        evaluation_mode: "mixed",
        academic: {
          institution: "Universitat Politècnica de València",
          school: "ETSINF",
          degree: "Grado en Ingeniería Informática",
          subject_name: "Proyectos de Inteligencia Artificial",
          subject_code: "PIA",
          academic_year: "2026-2027",
          term: "Primer semestre",
        },
      },
    },
  );
  if (createError) throw createError;
  eventId = created;

  const [{ data: academic }, { data: page }, { data: initialRubric }] = await Promise.all([
    owner.client.from("event_academic_contexts").select("subject_name, degree").eq("event_id", eventId).single(),
    owner.client.from("evaluation_pages").select("status, current_round").eq("event_id", eventId).single(),
    owner.client.from("rubrics").select("id").eq("event_id", eventId).eq("is_active", true).single(),
  ]);
  check("Un espacio académico guarda asignatura y titulación", academic?.subject_name === "Proyectos de Inteligencia Artificial" && Boolean(academic?.degree));
  check("Todo espacio nace con página de evaluación y ronda 1", page?.status === "draft" && page?.current_round === 1);
  check("Todo espacio nace con una rúbrica activa", Boolean(initialRubric?.id));

  await admin.from("event_members").insert({
    event_id: eventId,
    user_id: judge.id,
    role: "judge",
    status: "active",
  });
  const { data: challenge } = await admin.from("challenges").insert({ event_id: eventId, name: "Reto" }).select("id").single();
  const { data: teams } = await admin.from("teams").insert([
    { event_id: eventId, challenge_id: challenge.id, name: "Proyecto asignado", number: 1 },
    { event_id: eventId, challenge_id: challenge.id, name: "Proyecto ajeno", number: 2 },
  ]).select("id");
  const { data: panel } = await owner.client.from("jury_panels").insert({ event_id: eventId, name: "Panel A" }).select("id").single();
  await owner.client.from("jury_panel_members").insert({ event_id: eventId, panel_id: panel.id, user_id: judge.id });
  await owner.client.from("jury_panel_assignments").insert({ event_id: eventId, panel_id: panel.id, team_id: teams[0].id, round: 1 });

  const [{ data: assigned }, { data: unassigned }] = await Promise.all([
    judge.client.rpc("can_vote_team", { target_event: eventId, target_team: teams[0].id }),
    judge.client.rpc("can_vote_team", { target_event: eventId, target_team: teams[1].id }),
  ]);
  check("El jurado puede votar su proyecto asignado", assigned === true);
  check("El jurado no puede votar proyectos de otro panel", unassigned === false);

  await owner.client.from("jury_panels").update({ active: false }).eq("id", panel.id);
  const { data: withoutActivePanels } = await judge.client.rpc("can_vote_team", {
    target_event: eventId,
    target_team: teams[1].id,
  });
  check("Un panel desactivado no bloquea proyectos ni concede permisos", withoutActivePanels === true);
  await owner.client.from("jury_panels").update({ active: true }).eq("id", panel.id);

  await owner.client.from("evaluation_pages").update({ current_round: 2 }).eq("event_id", eventId);
  const { data: nextRoundOpen } = await judge.client.rpc("can_vote_team", {
    target_event: eventId,
    target_team: teams[1].id,
  });
  check("Las asignaciones de otra ronda no restringen la ronda activa", nextRoundOpen === true);
  await owner.client.from("evaluation_pages").update({ current_round: 1 }).eq("event_id", eventId);

  const { data: forbiddenPage } = await judge.client
    .from("evaluation_pages")
    .update({ title: "Cambio no autorizado" })
    .eq("event_id", eventId)
    .select("id");
  check("Un juez no puede cambiar la página de evaluación", !forbiddenPage?.length);

  const proposal = {
    evaluation: {
      title: "Evaluación de proyectos de IA",
      description: "Evaluación completa",
      instructions: "Revisa la demo y la memoria.",
      rubricName: "Rúbrica IA",
      scaleMin: 1,
      scaleMax: 5,
      aggregationMethod: "hybrid",
      minEvaluations: 2,
      requirements: [{ key: "demo", label: "Demo disponible", description: null, required: true }],
      questions: [{ key: "observaciones", label: "Observaciones", description: null, type: "textarea", required: false, options: [] }],
      criteria: [
        { title: "Impacto", description: "Valor generado", weight: 60, order: 0, levels: [1, 2, 3, 4, 5].map((score) => ({ score, label: `Nivel ${score}`, descriptor: `Impacto ${score}` })) },
        { title: "Viabilidad", description: "Capacidad de ejecución", weight: 40, order: 1, levels: [1, 2, 3, 4, 5].map((score) => ({ score, label: `Nivel ${score}`, descriptor: `Viabilidad ${score}` })) },
      ],
    },
    academic: null,
    jury: { enabled: true, panelNames: ["Panel A"], assignmentMode: "manual" },
  };
  const { error: proposalError } = await owner.client.rpc("apply_evaluation_proposal", {
    p_event_id: eventId,
    p_proposal: proposal,
  });
  check("El gestor puede aplicar atómicamente una propuesta completa", !proposalError, proposalError?.message);

  const [{ data: configuredPage }, { data: configuredRubric }] = await Promise.all([
    owner.client.from("evaluation_pages").select("title, status, aggregation_method, min_evaluations").eq("event_id", eventId).single(),
    owner.client.from("rubrics").select("id, rubric_criteria(id, weight, rubric_levels(score))").eq("event_id", eventId).eq("is_active", true).single(),
  ]);
  const criteria = configuredRubric?.rubric_criteria ?? [];
  check("La propuesta queda como borrador con el cálculo solicitado", configuredPage?.status === "draft" && configuredPage?.aggregation_method === "hybrid" && configuredPage?.min_evaluations === 2);
  check("La nueva rúbrica conserva criterios, pesos y niveles", criteria.length === 2 && criteria.reduce((sum, item) => sum + Number(item.weight), 0) === 100 && criteria.every((item) => item.rubric_levels.length === 5));
} catch (error) {
  console.error("Error durante la prueba de funciones:", error.message ?? error);
  failures += 1;
} finally {
  if (eventId) await admin.from("events").delete().eq("id", eventId);
  for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  console.log(`\n${failures ? `✘ ${failures} prueba(s) fallida(s)` : "✔ Funciones configurables verificadas"}. Datos temporales eliminados.`);
  process.exit(failures ? 1 : 0);
}

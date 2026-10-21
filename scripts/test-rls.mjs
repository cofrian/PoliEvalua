// Pruebas de permisos (RLS) contra la base de datos real.
// Crea un juez, otro juez, un mentor y un admin temporales, comprueba qué puede
// hacer cada uno y lo borra todo al terminar.
//
// Uso: node scripts/test-rls.mjs   (lee las claves de .env.local)
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l
        .slice(l.indexOf("=") + 1)
        .trim()
        .replace(/^"|"$/g, ""),
    ]),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const stamp = Date.now();
const created = [];
let failures = 0;

function check(name, ok, detail = "") {
  console.log(
    `${ok ? "✔" : "✘"} ${name}${!ok && detail ? ` — ${detail}` : ""}`,
  );
  if (!ok) failures++;
}

async function makeUser(role, eventId) {
  const email = `rls-${role}-${stamp}-${created.length}@test.local`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Prueba ${role}` },
    app_metadata: { created_by_server: true },
  });
  if (error) throw error;
  created.push(data.user.id);
  await admin
    .from("profiles")
    .update({ role, disabled: false })
    .eq("id", data.user.id);
  await admin.from("event_members").insert({
    event_id: eventId,
    user_id: data.user.id,
    role: role === "admin" ? "owner" : role,
    status: "active",
  });
  const client = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;
  return { id: data.user.id, client };
}

try {
  const { data: team } = await admin
    .from("teams")
    .select("id")
    .limit(1)
    .single();
  const { data: rubric } = await admin
    .from("rubrics")
    .select("id, rubric_criteria(id, weight, deleted_at)")
    .eq("is_active", true)
    .limit(1)
    .single();
  const { data: event } = await admin
    .from("events")
    .select("*")
    .limit(1)
    .single();
  const criteria = rubric.rubric_criteria.filter((c) => !c.deleted_at);

  const judgeA = await makeUser("judge", event.id);
  const judgeB = await makeUser("judge", event.id);
  const mentor = await makeUser("mentor", event.id);
  const boss = await makeUser("admin", event.id);

  // ---------- Notas ----------
  const { data: privateNote } = await judgeA.client
    .from("notes")
    .insert({
      team_id: team.id,
      author_id: judgeA.id,
      body: "privada",
      is_shared: false,
    })
    .select("id")
    .single();
  const { data: sharedNote } = await judgeA.client
    .from("notes")
    .insert({
      team_id: team.id,
      author_id: judgeA.id,
      body: "compartida",
      is_shared: true,
    })
    .select("id")
    .single();
  check("Un juez puede crear notas", Boolean(privateNote && sharedNote));

  const { data: seenByB } = await judgeB.client
    .from("notes")
    .select("id")
    .in("id", [privateNote.id, sharedNote.id]);
  check(
    "Otro juez NO ve la nota privada",
    !seenByB.some((n) => n.id === privateNote.id),
  );
  check(
    "Otro juez SÍ ve la nota compartida",
    seenByB.some((n) => n.id === sharedNote.id),
  );

  const { data: seenByMentor } = await mentor.client
    .from("notes")
    .select("id")
    .in("id", [privateNote.id, sharedNote.id]);
  check(
    "El mentor NO ve la nota privada",
    !seenByMentor.some((n) => n.id === privateNote.id),
  );
  check(
    "El mentor SÍ ve la nota compartida",
    seenByMentor.some((n) => n.id === sharedNote.id),
  );

  const { data: seenByAdmin } = await boss.client
    .from("notes")
    .select("id")
    .eq("id", privateNote.id);
  check("El admin SÍ ve las notas privadas de todos", seenByAdmin.length === 1);

  const { data: editedByB } = await judgeB.client
    .from("notes")
    .update({ body: "pirateada" })
    .eq("id", sharedNote.id)
    .select("id");
  check("Otro juez NO puede editar una nota ajena", !editedByB?.length);

  const { data: mentorNote } = await mentor.client
    .from("notes")
    .insert({
      team_id: team.id,
      author_id: mentor.id,
      body: "nota del mentor",
      is_shared: true,
    })
    .select("id")
    .single();
  check("El mentor puede crear notas", Boolean(mentorNote));

  // ---------- Evaluaciones ----------
  const { error: mentorEvalError } = await mentor.client
    .from("evaluations")
    .insert({ team_id: team.id, judge_id: mentor.id, rubric_id: rubric.id });
  check("El mentor NO puede evaluar", Boolean(mentorEvalError));

  const { data: evalA, error: evalError } = await judgeA.client
    .from("evaluations")
    .insert({
      team_id: team.id,
      judge_id: judgeA.id,
      rubric_id: rubric.id,
      status: "submitted",
    })
    .select("id")
    .single();
  check(
    "Un juez puede evaluar",
    !evalError && Boolean(evalA),
    evalError?.message,
  );

  await judgeA.client
    .from("evaluation_scores")
    .insert(
      criteria.map((c) => ({
        evaluation_id: evalA.id,
        criterion_id: c.id,
        score: 3,
      })),
    );
  const { data: total } = await judgeA.client
    .from("evaluation_totals")
    .select("total")
    .eq("evaluation_id", evalA.id)
    .single();
  check(
    "Total calculado correctamente (todo 3 → 60/100)",
    Number(total?.total) === 60,
    `total=${total?.total}`,
  );

  const { error: outOfRangeError } = await judgeA.client
    .from("evaluation_scores")
    .update({ score: 1000 })
    .eq("evaluation_id", evalA.id)
    .eq("criterion_id", criteria[0].id);
  check(
    "Un juez NO puede puntuar fuera de la escala",
    Boolean(outOfRangeError),
  );

  const { data: otherRubric } = await admin
    .from("rubric_criteria")
    .select("id")
    .neq("rubric_id", rubric.id)
    .limit(1)
    .maybeSingle();
  if (otherRubric) {
    const { error: foreignCriterionError } = await judgeA.client
      .from("evaluation_scores")
      .insert({
        evaluation_id: evalA.id,
        criterion_id: otherRubric.id,
        score: 3,
      });
    check(
      "Un juez NO puede puntuar un criterio de otra rúbrica",
      Boolean(foreignCriterionError),
    );
  }

  const { data: scaleBefore } = await admin
    .from("rubrics")
    .select("scale_max")
    .eq("id", rubric.id)
    .single();
  await judgeA.client
    .from("rubrics")
    .update({ scale_max: 1 })
    .eq("id", rubric.id);
  const { data: scaleAfter } = await admin
    .from("rubrics")
    .select("scale_max")
    .eq("id", rubric.id)
    .single();
  // Si esta prueba descubre una política insegura, restaura siempre el valor:
  // una prueba fallida nunca debe dejar la rúbrica real modificada.
  if (scaleAfter.scale_max !== scaleBefore.scale_max) {
    await admin
      .from("rubrics")
      .update({ scale_max: scaleBefore.scale_max })
      .eq("id", rubric.id);
  }
  check(
    "Un juez NO puede cambiar la escala de la rúbrica",
    scaleAfter.scale_max === scaleBefore.scale_max,
  );

  const { data: seenEvalsB } = await judgeB.client
    .from("evaluations")
    .select("id")
    .eq("id", evalA.id);
  if (event.status === "closed") {
    check(
      "Con el evento cerrado, otro juez SÍ ve evaluaciones ajenas",
      seenEvalsB.length === 1,
    );
  } else {
    check(
      "Antes del cierre, otro juez NO ve evaluaciones ajenas",
      seenEvalsB.length === 0,
    );
  }
  const { data: seenEvalsAdmin } = await boss.client
    .from("evaluations")
    .select("id")
    .eq("id", evalA.id);
  check("El admin SÍ ve todas las evaluaciones", seenEvalsAdmin.length === 1);

  const { error: forgeError } = await judgeB.client
    .from("evaluations")
    .insert({ team_id: team.id, judge_id: judgeA.id, rubric_id: rubric.id });
  check("Un juez NO puede evaluar en nombre de otro", Boolean(forgeError));

  // Borrador visible en directo para el admin, no para otros jueces.
  const { data: draftB } = await judgeB.client
    .from("evaluations")
    .insert({
      team_id: team.id,
      judge_id: judgeB.id,
      rubric_id: rubric.id,
      status: "draft",
    })
    .select("id")
    .single();
  await judgeB.client
    .from("evaluation_scores")
    .insert({
      evaluation_id: draftB.id,
      criterion_id: criteria[0].id,
      score: 4,
    });
  const { data: adminDraft } = await boss.client
    .from("evaluations")
    .select("id, evaluation_scores(score)")
    .eq("id", draftB.id)
    .single();
  check(
    "El admin SÍ ve los borradores y sus puntuaciones en directo",
    adminDraft?.evaluation_scores?.[0]?.score === 4,
  );
  const { data: draftSeenByA } = await judgeA.client
    .from("evaluations")
    .select("id")
    .eq("id", draftB.id);
  if (event.status !== "closed") {
    check("Otro juez NO ve el borrador ajeno", draftSeenByA.length === 0);
  }

  // ---------- Rúbrica ----------
  const criterion = criteria[0];
  const { data: mentorRubric } = await mentor.client
    .from("rubric_criteria")
    .update({ weight: criterion.weight })
    .eq("id", criterion.id)
    .select("id");
  check("El mentor NO puede editar la rúbrica", !mentorRubric?.length);

  const { data: wasLocked } = await admin
    .from("rubrics")
    .select("locked")
    .eq("id", rubric.id)
    .single();
  if (!wasLocked.locked) {
    const { data: judgeRubric } = await judgeA.client
      .from("rubric_criteria")
      .update({ weight: criterion.weight })
      .eq("id", criterion.id)
      .select("id");
    check(
      "Un juez SÍ puede editar la rúbrica sin bloquear",
      judgeRubric?.length === 1,
    );
  }

  const { error: lockError } = await boss.client
    .from("rubrics")
    .update({ locked: true })
    .eq("id", rubric.id);
  check(
    "El admin SÍ puede bloquear la rúbrica (pesos = 100)",
    !lockError,
    lockError?.message,
  );
  const { data: judgeLocked } = await judgeA.client
    .from("rubric_criteria")
    .update({ weight: criterion.weight })
    .eq("id", criterion.id)
    .select("id");
  check("Un juez NO puede editar la rúbrica bloqueada", !judgeLocked?.length);
  const { data: adminLocked } = await boss.client
    .from("rubric_criteria")
    .update({ weight: criterion.weight })
    .eq("id", criterion.id)
    .select("id");
  check(
    "El admin SÍ puede editar la rúbrica aunque esté bloqueada",
    adminLocked?.length === 1,
  );
  await admin
    .from("rubrics")
    .update({ locked: wasLocked.locked })
    .eq("id", rubric.id);

  const { error: badLock } = await (async () => {
    await admin
      .from("rubric_criteria")
      .update({ weight: Number(criterion.weight) + 1 })
      .eq("id", criterion.id);
    const result = await boss.client
      .from("rubrics")
      .update({ locked: true })
      .eq("id", rubric.id);
    await admin
      .from("rubric_criteria")
      .update({ weight: criterion.weight })
      .eq("id", criterion.id);
    await admin
      .from("rubrics")
      .update({ locked: wasLocked.locked })
      .eq("id", rubric.id);
    return result;
  })();
  check("No se puede bloquear si los pesos no suman 100", Boolean(badLock));

  // ---------- Roles ----------
  const { data: selfPromote } = await judgeA.client
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", judgeA.id)
    .select("id");
  check("Un juez NO puede hacerse admin", !selfPromote?.length);

  const { data: teamEdit } = await judgeA.client
    .from("teams")
    .update({ name: "pirata" })
    .eq("id", team.id)
    .select("id");
  check("Un juez NO puede renombrar equipos", !teamEdit?.length);
} catch (error) {
  console.error("Error durante las pruebas:", error.message ?? error);
  failures++;
} finally {
  for (const id of created) {
    await admin.from("notes").delete().eq("author_id", id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(
    `\n${failures ? `✘ ${failures} prueba(s) fallida(s)` : "✔ Todas las pruebas pasan"}. Usuarios temporales borrados.`,
  );
  process.exit(failures ? 1 : 0);
}

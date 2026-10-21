// Privacidad del alumnado, vinculación por correo y entregas como enlaces
// (migración 0019) contra el proyecto Supabase enlazado. Todo se crea en un
// espacio temporal y se elimina al terminar.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadTestEnv } from "./load-test-env.mjs";

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
  const email = `students-${label}-${stamp}@test.local`;
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
  return { id: data.user.id, email, client };
}

try {
  const owner = await createUser("owner");
  const judge = await createUser("judge");
  const studentA = await createUser("alumna");
  const studentB = await createUser("alumno");

  const { data: created, error: createError } = await owner.client.rpc("create_event_space", {
    p_name: `Alumnado ${stamp}`,
    p_slug: `alumnado-${stamp}`,
    p_kind: "class",
    p_signup_code: `ALUM-${stamp}`,
    p_description: "Espacio temporal de integración",
    p_settings: { participant_mode: "groups", evaluation_mode: "mixed" },
  });
  if (createError) throw createError;
  eventId = created;

  const { data: teams } = await admin
    .from("teams")
    .insert([
      { event_id: eventId, name: "Grupo 1", number: 1 },
      { event_id: eventId, name: "Grupo 2", number: 2 },
    ])
    .select("id");
  const [groupA, groupB] = teams.map((team) => team.id);

  // La alumna está en la lista antes de entrar; el alumno, después.
  await owner.client.from("team_members").insert({
    event_id: eventId,
    team_id: groupA,
    full_name: "Alumna",
    email: studentA.email.toUpperCase(),
  });
  await admin.from("event_members").insert([
    { event_id: eventId, user_id: judge.id, role: "judge", status: "active" },
    { event_id: eventId, user_id: studentA.id, role: "student", status: "active" },
    { event_id: eventId, user_id: studentB.id, role: "student", status: "active" },
  ]);
  await owner.client.from("team_members").insert({
    event_id: eventId,
    team_id: groupB,
    full_name: "Alumno",
    email: studentB.email,
  });

  const { data: links } = await admin
    .from("team_members")
    .select("email, user_id")
    .eq("event_id", eventId);
  check(
    "Al entrar en el espacio, el correo de la lista se vincula a la cuenta",
    links?.find((row) => row.email === studentA.email)?.user_id === studentA.id,
    JSON.stringify(links),
  );
  check(
    "Al añadir a quien ya estaba en el espacio, se vincula al momento",
    links?.find((row) => row.email === studentB.email)?.user_id === studentB.id,
  );

  const { data: visibleMembers } = await studentA.client
    .from("team_members")
    .select("team_id")
    .eq("event_id", eventId);
  check(
    "El alumnado solo ve a los integrantes de su grupo",
    visibleMembers?.length === 1 && visibleMembers[0].team_id === groupA,
    JSON.stringify(visibleMembers),
  );

  await judge.client.from("notes").insert({
    event_id: eventId,
    team_id: groupA,
    author_id: judge.id,
    body: "Nota compartida del jurado",
    is_shared: true,
  });
  const [{ data: studentNotes }, { data: judgeNotes }] = await Promise.all([
    studentA.client.from("notes").select("id").eq("event_id", eventId),
    owner.client.from("notes").select("id").eq("event_id", eventId),
  ]);
  check("El alumnado no ve las notas compartidas del jurado", (studentNotes ?? []).length === 0);
  check("La gestión sigue viendo las notas compartidas", (judgeNotes ?? []).length === 1);

  const { data: rubric } = await admin
    .from("rubrics")
    .select("id")
    .eq("event_id", eventId)
    .eq("is_active", true)
    .single();
  await admin.from("evaluations").insert({
    event_id: eventId,
    team_id: groupA,
    judge_id: judge.id,
    rubric_id: rubric.id,
    status: "submitted",
  });
  await admin.from("events").update({ status: "closed" }).eq("id", eventId);
  const [{ data: studentEvals }, { data: judgeEvals }] = await Promise.all([
    studentA.client.from("evaluations").select("id").eq("event_id", eventId),
    judge.client.from("evaluations").select("id").eq("event_id", eventId),
  ]);
  check("Con el espacio cerrado, el alumnado no ve las evaluaciones", (studentEvals ?? []).length === 0);
  check("Con el espacio cerrado, el jurado sí", (judgeEvals ?? []).length === 1);
  await admin.from("events").update({ status: "setup" }).eq("id", eventId);

  const { error: ownLinkError } = await studentA.client.from("team_links").insert({
    event_id: eventId,
    team_id: groupA,
    kind: "repo",
    url: "https://github.com/upv/proyecto",
    created_by: studentA.id,
  });
  check("Un grupo puede añadir sus enlaces de entrega", !ownLinkError, ownLinkError?.message);

  const { error: otherLinkError } = await studentA.client.from("team_links").insert({
    event_id: eventId,
    team_id: groupB,
    kind: "repo",
    url: "https://github.com/upv/ajeno",
    created_by: studentA.id,
  });
  check("Nadie puede añadir enlaces a un grupo ajeno", Boolean(otherLinkError));

  const { error: badUrlError } = await studentA.client.from("team_links").insert({
    event_id: eventId,
    team_id: groupA,
    kind: "web",
    url: "javascript:alert(1)",
    created_by: studentA.id,
  });
  check("Solo se aceptan enlaces http(s)", Boolean(badUrlError));

  const [{ data: studentBLinks }, { data: judgeLinks }] = await Promise.all([
    studentB.client.from("team_links").select("id").eq("event_id", eventId),
    judge.client.from("team_links").select("id").eq("event_id", eventId),
  ]);
  check("Otro grupo no ve las entregas ajenas", (studentBLinks ?? []).length === 0);
  check("El jurado ve las entregas", (judgeLinks ?? []).length === 1);

  // Feedback (migración 0021): solo el propio grupo y solo una vez publicado.
  const { error: unpublishedError } = await studentA.client.rpc("team_feedback", { target_team: groupA });
  check("Sin publicar, el grupo no puede ver su feedback", Boolean(unpublishedError));
  const { data: eventRow } = await admin.from("events").select("settings").eq("id", eventId).single();
  await admin
    .from("events")
    .update({ settings: { ...(eventRow?.settings ?? {}), students: { publish_results: true } } })
    .eq("id", eventId);
  const [{ data: ownFeedback, error: ownFeedbackError }, { error: otherFeedbackError }] = await Promise.all([
    studentA.client.rpc("team_feedback", { target_team: groupA }),
    studentB.client.rpc("team_feedback", { target_team: groupA }),
  ]);
  check(
    "Publicado, el grupo ve su feedback",
    !ownFeedbackError && ownFeedback?.evaluations === 1,
    ownFeedbackError?.message ?? JSON.stringify(ownFeedback),
  );
  check("Otro grupo no puede ver ese feedback", Boolean(otherFeedbackError));

  // Coevaluación (migración 0022).
  const { data: settingsRow } = await admin.from("events").select("settings").eq("id", eventId).single();
  await admin
    .from("events")
    .update({
      settings: {
        ...(settingsRow?.settings ?? {}),
        peer_review: { enabled: true, peer: true, self: true, contribution: true },
      },
    })
    .eq("id", eventId);
  await admin.from("peer_assignments").insert({ event_id: eventId, reviewer_id: studentA.id, team_id: groupB });

  const peerRow = (teamId, kind) => ({
    event_id: eventId,
    reviewer_id: studentA.id,
    team_id: teamId,
    kind,
    scores: {},
    status: "submitted",
  });
  const [{ error: assignedError }, { error: unassignedSelfAsPeer }, { error: selfError }] = await Promise.all([
    studentA.client.from("peer_reviews").insert(peerRow(groupB, "peer")),
    studentA.client.from("peer_reviews").insert(peerRow(groupA, "peer")),
    studentA.client.from("peer_reviews").insert(peerRow(groupA, "self")),
  ]);
  check("Se puede coevaluar un grupo asignado", !assignedError, assignedError?.message);
  check("No se puede coevaluar como «compañero» al propio grupo", Boolean(unassignedSelfAsPeer));
  check("Se puede autoevaluar al propio grupo", !selfError, selfError?.message);

  const { data: othersReviews } = await studentB.client.from("peer_reviews").select("id").eq("event_id", eventId);
  check("Nadie ve las revisiones de otros estudiantes", (othersReviews ?? []).length === 0);

  const { data: memberRows } = await admin.from("team_members").select("id, user_id").eq("event_id", eventId);
  const selfMember = memberRows.find((row) => row.user_id === studentA.id);
  const otherMember = memberRows.find((row) => row.user_id === studentB.id);
  const [{ error: rateSelfError }, { error: rateOtherTeamError }] = await Promise.all([
    studentA.client.from("contribution_reviews").insert({ event_id: eventId, reviewer_id: studentA.id, member_id: selfMember.id, score: 5 }),
    studentA.client.from("contribution_reviews").insert({ event_id: eventId, reviewer_id: studentA.id, member_id: otherMember.id, score: 1 }),
  ]);
  check("Nadie puede valorar su propia aportación", Boolean(rateSelfError));
  check("No se valora la aportación de alguien de otro grupo", Boolean(rateOtherTeamError));
} catch (error) {
  failures += 1;
  console.error("✘ Error inesperado:", error instanceof Error ? error.message : error);
} finally {
  if (eventId) await admin.from("events").delete().eq("id", eventId);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
}

if (failures) {
  console.error(`\n${failures} comprobación(es) fallida(s).`);
  process.exit(1);
}
console.log("\nPrivacidad del alumnado correcta.");

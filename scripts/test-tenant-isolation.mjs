// Prueba de aislamiento real entre dos espacios contra la base enlazada.
// Crea datos temporales con service_role, intenta cruzarlos con usuarios
// normales y elimina únicamente los registros temporales al terminar.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadTestEnv } from "./load-test-env.mjs";

const env = loadTestEnv();

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const stamp = Date.now();
const eventIds = [];
const userIds = [];
let failures = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function createUser(label) {
  const email = `tenant-${label}-${stamp}@test.local`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Tenant ${label}` },
  });
  if (error) throw error;
  userIds.push(data.user.id);
  await admin.from("profiles").update({ disabled: false }).eq("id", data.user.id);
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, client };
}

async function createSpace(label, ownerId) {
  const { data: event, error } = await admin
    .from("events")
    .insert({
      name: `Aislamiento ${label}`,
      slug: `aislamiento-${label.toLowerCase()}-${stamp}`,
      kind: "project",
      signup_code: `ISO-${label}-${stamp}`,
      signup_open: false,
      created_by: ownerId,
    })
    .select("id")
    .single();
  if (error) throw error;
  eventIds.push(event.id);
  await admin.from("event_members").insert({
    event_id: event.id,
    user_id: ownerId,
    role: "owner",
    status: "active",
  });
  const { data: challenge } = await admin
    .from("challenges")
    .insert({ event_id: event.id, name: `Reto ${label}` })
    .select("id")
    .single();
  const { data: team } = await admin
    .from("teams")
    .insert({ event_id: event.id, challenge_id: challenge.id, name: `Equipo ${label}` })
    .select("id")
    .single();
  const { data: note } = await admin
    .from("notes")
    .insert({
      event_id: event.id,
      team_id: team.id,
      author_id: ownerId,
      body: `Dato secreto ${label}`,
      is_shared: true,
    })
    .select("id")
    .single();
  return { eventId: event.id, teamId: team.id, noteId: note.id };
}

try {
  const alice = await createUser("A");
  const bob = await createUser("B");
  const spaceA = await createSpace("A", alice.id);
  const spaceB = await createSpace("B", bob.id);

  const { data: aliceEvents } = await alice.client.from("events").select("id");
  check(
    "Un miembro del espacio A no puede descubrir el espacio B",
    aliceEvents?.length === 1 && aliceEvents[0].id === spaceA.eventId,
  );

  const { data: aliceTeams } = await alice.client.from("teams").select("id, event_id");
  check(
    "El espacio A no puede leer equipos del espacio B",
    aliceTeams?.length === 1 && aliceTeams[0].event_id === spaceA.eventId,
  );

  const { data: aliceNotes } = await alice.client.from("notes").select("id, event_id, body");
  check(
    "Ni siquiera una nota compartida cruza de B a A",
    aliceNotes?.length === 1 && aliceNotes[0].id === spaceA.noteId,
  );

  const { data: aliceMembers } = await alice.client.from("event_members").select("event_id, user_id");
  check(
    "El propietario A no puede enumerar miembros de B",
    aliceMembers?.every((member) => member.event_id === spaceA.eventId),
  );

  const { data: changedB } = await alice.client
    .from("events")
    .update({ name: "Ataque cruzado" })
    .eq("id", spaceB.eventId)
    .select("id");
  check("El propietario A no puede modificar el espacio B", !changedB?.length);

  const { error: foreignNoteError } = await alice.client.from("notes").insert({
    event_id: spaceA.eventId,
    team_id: spaceB.teamId,
    author_id: alice.id,
    body: "Intento cruzado",
    is_shared: false,
  });
  check(
    "La integridad rechaza enlazar un equipo de B como dato de A",
    Boolean(foreignNoteError),
  );

  const { data: bobNotes } = await bob.client.from("notes").select("id, event_id");
  check(
    "El aislamiento también funciona de B hacia A",
    bobNotes?.length === 1 && bobNotes[0].id === spaceB.noteId,
  );

  const { data: scopedA } = await alice.client
    .from("teams")
    .select("id")
    .eq("event_id", spaceA.eventId);
  check("Las consultas del espacio activo solo devuelven su propio conjunto", scopedA?.length === 1);
} catch (error) {
  console.error("Error durante la prueba multiespacio:", error.message ?? error);
  failures++;
} finally {
  for (const eventId of eventIds) await admin.from("events").delete().eq("id", eventId);
  for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  console.log(
    `\n${failures ? `✘ ${failures} prueba(s) de aislamiento fallida(s)` : "✔ Aislamiento multiespacio verificado"}. Datos temporales eliminados.`,
  );
  process.exit(failures ? 1 : 0);
}

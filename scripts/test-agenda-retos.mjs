// Grupos en varios retos y exposiciones con orden flexible (migración 0037).
// Todo se crea en un espacio temporal que se borra al terminar.
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
  const email = `agenda-${label}-${stamp}@test.local`;
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

const slotsOf = async () =>
  (
    await admin
      .from("presentation_slots")
      .select("id, team_id, position, starts_at, status, started_at, ended_at")
      .eq("event_id", eventId)
      .order("position")
  ).data ?? [];
const slotById = async (id) => (await slotsOf()).find((slot) => slot.id === id);

try {
  const owner = await createUser("owner");
  const judge = await createUser("judge");
  const viewer = await createUser("viewer");
  const { data: created, error: createError } = await owner.client.rpc("create_event_space", {
    p_name: `Agenda ${stamp}`,
    p_slug: `agenda-${stamp}`,
    p_kind: "hackathon",
    p_signup_code: `AGE-${stamp}`,
    p_description: "Espacio temporal de integración",
    p_settings: {},
  });
  if (createError) throw createError;
  eventId = created;
  await admin.from("event_members").insert([
    { event_id: eventId, user_id: judge.id, role: "judge", status: "active" },
    { event_id: eventId, user_id: viewer.id, role: "viewer", status: "active" },
  ]);

  // ── 1. Grupos en varios retos ──────────────────────────────────────────
  const { data: challenges } = await admin
    .from("challenges")
    .insert([
      { event_id: eventId, name: "Reto A" },
      { event_id: eventId, name: "Reto B" },
      { event_id: eventId, name: "Reto C" },
    ])
    .select("id, name");
  const [a, b, c] = ["Reto A", "Reto B", "Reto C"].map((name) => challenges.find((x) => x.name === name).id);
  const { data: teams } = await admin
    .from("teams")
    .insert([1, 2, 3, 4].map((n) => ({ event_id: eventId, challenge_id: a, name: `Grupo ${n}`, number: n })))
    .select("id, number");
  const team = Object.fromEntries(teams.map((t) => [t.number, t.id]));

  const { error: ownerInsert } = await owner.client.from("team_challenges").insert([
    { team_id: team[1], challenge_id: b, event_id: eventId },
    { team_id: team[1], challenge_id: c, event_id: eventId },
  ]);
  check("La gestión apunta un grupo a varios retos", !ownerInsert, ownerInsert?.message);

  const { data: judgeSees } = await judge.client.from("team_challenges").select("challenge_id").eq("team_id", team[1]);
  check("El jurado ve los retos adicionales", judgeSees?.length === 2);

  const { error: judgeInsert } = await judge.client
    .from("team_challenges")
    .insert({ team_id: team[2], challenge_id: b, event_id: eventId });
  const { data: afterJudge } = await admin.from("team_challenges").select("team_id").eq("team_id", team[2]);
  check("El jurado no puede apuntar grupos a retos", Boolean(judgeInsert) && afterJudge.length === 0);

  const { error: viewerDelete } = await viewer.client.from("team_challenges").delete().eq("team_id", team[1]);
  const { data: stillThere } = await admin.from("team_challenges").select("challenge_id").eq("team_id", team[1]);
  check("El público no puede quitar retos", stillThere.length === 2, viewerDelete?.message);

  const { error: dup } = await owner.client
    .from("team_challenges")
    .insert({ team_id: team[1], challenge_id: b, event_id: eventId });
  check("No se repite el mismo reto dos veces", dup?.code === "23505");

  const { data: otherEvent } = await admin
    .from("events")
    .select("id")
    .neq("id", eventId)
    .limit(1)
    .maybeSingle();
  if (otherEvent) {
    const { error: cross } = await admin
      .from("team_challenges")
      .insert({ team_id: team[1], challenge_id: b, event_id: otherEvent.id });
    check("Un reto de otro espacio no se puede mezclar", Boolean(cross));
  }

  // ── 2. Exposiciones flexibles ─────────────────────────────────────────
  const base = new Date("2030-01-01T10:00:00Z").getTime();
  const { data: inserted, error: slotError } = await admin
    .from("presentation_slots")
    .insert(
      [1, 2, 3].map((n, i) => ({
        event_id: eventId,
        team_id: team[n],
        room: "Sala 1",
        position: i,
        starts_at: new Date(base + i * 10 * 60_000).toISOString(),
      })),
    )
    .select("id, team_id");
  if (slotError) throw slotError;
  const slot = Object.fromEntries(inserted.map((s) => [teams.find((t) => t.id === s.team_id).number, s.id]));
  const setStatus = (client, id, status) => client.rpc("set_slot_status", { target_slot: id, next_status: status });

  await setStatus(judge.client, slot[1], "skipped");
  let s1 = await slotById(slot[1]);
  check("Se puede saltar un grupo", s1.status === "skipped" && Boolean(s1.ended_at));

  await setStatus(judge.client, slot[2], "live");
  const { error: reopenSkipped } = await setStatus(judge.client, slot[1], "live");
  s1 = await slotById(slot[1]);
  const s2 = await slotById(slot[2]);
  check("Un grupo saltado puede volver a exponer", !reopenSkipped && s1.status === "live" && !s1.ended_at, reopenSkipped?.message);
  check("Solo un grupo en directo por sala: el anterior pasa a hecho", s2.status === "done" && Boolean(s2.ended_at));

  await setStatus(judge.client, slot[1], "done");
  const firstStart = (await slotById(slot[1])).started_at;
  await new Promise((r) => setTimeout(r, 1200));
  await setStatus(judge.client, slot[1], "live");
  s1 = await slotById(slot[1]);
  check(
    "Al reabrir uno hecho el cronómetro arranca de cero",
    s1.status === "live" && new Date(s1.started_at) > new Date(firstStart) && !s1.ended_at,
  );

  const liveAgainStart = s1.started_at;
  await setStatus(judge.client, slot[1], "live");
  check("Pulsar «en directo» dos veces no reinicia el cronómetro", (await slotById(slot[1])).started_at === liveAgainStart);

  await setStatus(judge.client, slot[2], "pending");
  const back = await slotById(slot[2]);
  check("Un grupo hecho se puede devolver a la cola", back.status === "pending" && !back.started_at && !back.ended_at);

  const { error: badStatus } = await setStatus(judge.client, slot[3], "foo");
  check("Un estado inventado se rechaza", Boolean(badStatus));
  const { error: viewerStatus } = await setStatus(viewer.client, slot[3], "live");
  check("El público no puede cambiar turnos", Boolean(viewerStatus) && (await slotById(slot[3])).status === "pending");

  // ── 3. Cambiar el orden ───────────────────────────────────────────────
  const hoursBefore = (await slotsOf()).map((s) => s.starts_at);
  const { error: moveError } = await judge.client.rpc("move_slot", { target_slot: slot[3], new_index: 0 });
  let order = await slotsOf();
  check("El jurado mueve un grupo al principio", !moveError && order.map((s) => s.id).join() === [slot[3], slot[1], slot[2]].join(), moveError?.message);
  check("Las horas planificadas se quedan en sus huecos", order.map((s) => s.starts_at).join() === hoursBefore.join());
  check("Las posiciones quedan consecutivas", order.map((s) => s.position).join() === "0,1,2");

  await judge.client.rpc("move_slot", { target_slot: slot[3], new_index: 99 });
  order = await slotsOf();
  check("Un índice fuera de rango lo deja al final", order.at(-1).id === slot[3]);
  await judge.client.rpc("move_slot", { target_slot: slot[2], new_index: -5 });
  order = await slotsOf();
  check("Un índice negativo lo deja al principio", order[0].id === slot[2]);

  const before = (await slotsOf()).map((s) => s.id).join();
  const { error: viewerMove } = await viewer.client.rpc("move_slot", { target_slot: slot[3], new_index: 0 });
  check("El público no puede cambiar el orden", Boolean(viewerMove) && (await slotsOf()).map((s) => s.id).join() === before);

  // Salas independientes: mover en una no toca la otra.
  const { data: other } = await admin
    .from("presentation_slots")
    .insert({ event_id: eventId, team_id: team[4], room: "Sala 2", position: 0 })
    .select("id, position")
    .single();
  await judge.client.rpc("move_slot", { target_slot: slot[1], new_index: 0 });
  check("Mover en una sala no toca la otra", (await slotById(other.id)).position === 0);
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
console.log("\nTodo correcto.");

// Prueba de humo del asistente de Admin: conversación con información a medias
// (debe preguntar), luego completa (debe proponer) y aplica la propuesta.
// Crea un espacio y una persona temporales y los borra al terminar.
// Uso: node scripts/smoke-assistant.mjs [url de la app]   (necesita NVIDIA_API_KEY en la app)
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { loadTestEnv } from "./load-test-env.mjs";

const env = loadTestEnv();
const base = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const email = `smoke-assistant-${stamp}@test.local`;
const password = `Prueba-${stamp}!`;
let userId = "";
let eventId = "";
let ok = true;

function check(condition, label) {
  console.log(`${condition ? "✔" : "✘"} ${label}`);
  if (!condition) ok = false;
}

try {
  // Las vueltas seguidas en local agotan el límite por IP (127.0.0.1): solo se
  // limpian los intentos de la IP local, nunca los de producción.
  if (base.includes("localhost")) {
    await db.from("auth_attempts").delete().eq("kind", "assistant").like("key", "assistant:ip:%127.0.0.1%");
    await db.from("auth_attempts").delete().eq("kind", "assistant").like("key", "assistant:ip:::1%");
  }
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Prueba Asistente" } });
  if (error) throw error;
  userId = data.user.id;
  await db.from("profiles").update({ disabled: false, full_name: "Prueba Asistente", locale: "es" }).eq("id", userId);
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await anon.auth.signInWithPassword({ email, password });
  const { data: created, error: spaceError } = await anon.rpc("create_event_space", {
    p_name: "Prueba del asistente", p_slug: `smoke-assistant-${stamp}`, p_kind: "class", p_signup_code: `ASIS-${stamp}`,
    p_description: "Espacio temporal",
    p_settings: { participant_mode: "groups", evaluation_mode: "mixed", enabled_roles: ["teacher", "student"], join_roles: ["student"], modules: ["participants", "rubric", "notes", "results"] },
  });
  if (spaceError) throw spaceError;
  eventId = created;

  const browser = await chromium.launch();
  const page = await (await browser.newContext({ locale: "es-ES" })).newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar en la plataforma" }).click();
  await page.waitForURL(/\/(espacios|equipos|admin)/);
  await page.context().addCookies([{ name: "active_event_id", value: eventId, url: base }]);

  const ask = async (message, threadId) => {
    const started = Date.now();
    const response = await page.request.post(`${base}/api/assistant`, { data: { message, threadId }, timeout: 130_000 });
    const body = await response.json();
    console.log(`\n» ${message}\n  (${Math.round((Date.now() - started) / 1000)} s, HTTP ${response.status()})`);
    if (!response.ok()) throw new Error(body.error);
    console.log(`  ${body.reply}`);
    for (const question of body.questions) console.log(`  ? ${question}`);
    if (body.action) console.log(`  → acción: ${body.action.type} ${JSON.stringify(body.action).slice(0, 300)}`);
    return body;
  };

  // 1. Grupos sin decir cuántos: debe preguntar.
  const first = await ask("Créame los grupos de la asignatura.");
  check(first.questions.length > 0 && !first.action, "pide lo que falta en vez de inventar grupos");

  // 2. Responde en el mismo hilo: debe proponer los grupos.
  const second = await ask("Seis grupos, numerados Grupo 1 a Grupo 6, sin integrantes todavía.", first.threadId);
  check(second.action?.type === "groups" && second.action.groups.length === 6, "propone 6 grupos tras la respuesta");

  // 3. Aplica la propuesta como lo haría el botón «Confirmar y aplicar».
  await page.goto(`${base}/admin/asistente?hilo=${first.threadId}`);
  await page.getByRole("button", { name: "Confirmar y aplicar" }).last().click();
  await page.waitForURL(/\/admin\/equipos/);
  const { count } = await db.from("teams").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  check(count === 6, `se han creado los grupos (${count})`);

  // 4. Agenda incompleta: debe preguntar salas y hora.
  const third = await ask("Ahora monta la agenda de exposiciones.", first.threadId);
  check(third.questions.length > 0 && !third.action, "pregunta salas, día u hora antes de montar la agenda");

  const fourth = await ask("El jueves 5 de noviembre de 2026 a las 9:00, en las aulas 1.1 y 1.2, turnos de 12 minutos con 3 de descanso, por número.", first.threadId);
  check(fourth.action?.type === "agenda" && fourth.action.rooms.length === 2, "propone la agenda con dos salas");

  await browser.close();
} catch (error) {
  ok = false;
  console.error("Error:", error instanceof Error ? error.message : error);
} finally {
  if (eventId) await db.from("events").delete().eq("id", eventId);
  if (userId) {
    await db.from("audit_log").delete().eq("user_id", userId);
    await db.auth.admin.deleteUser(userId);
  }
  console.log(ok ? "\nPRUEBA SUPERADA" : "\nPRUEBA FALLIDA");
  process.exit(ok ? 0 : 1);
}

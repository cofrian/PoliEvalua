// Capturas de las pantallas principales en local (escritorio y móvil) con un
// espacio y una persona temporales que se borran al terminar.
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { loadTestEnv } from "./load-test-env.mjs";

const env = loadTestEnv();
const base = process.env.SHOTS_BASE_URL ?? "http://localhost:3100";
const out = process.argv[2] ?? "shots";
const pages = (process.argv[3] ?? "/admin,/admin/ajustes,/admin/personas,/equipos,/agenda,/rubrica").split(",");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const email = `ux-${stamp}@test.local`;
const password = `Prueba-${stamp}!`;
let userId = "";
let eventId = "";
try {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Profesora Demo" } });
  if (error) throw error;
  userId = data.user.id;
  await db.from("profiles").update({ disabled: false, full_name: "Profesora Demo" }).eq("id", userId);
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await anon.auth.signInWithPassword({ email, password });
  const { data: created, error: e2 } = await anon.rpc("create_event_space", {
    p_name: "Proyectos de Ingeniería 2026", p_slug: `ux-${stamp}`, p_kind: "class", p_signup_code: `UX-${stamp}`,
    p_description: "Espacio de capturas",
    p_settings: { participant_mode: "groups", evaluation_mode: "mixed", enabled_roles: ["teacher", "student", "judge"], join_roles: ["student"], modules: ["participants", "rubric", "notes", "results"] },
  });
  if (e2) throw e2;
  eventId = created;
  const browser = await chromium.launch();
  for (const [name, viewport] of [["desk", { width: 1440, height: 900 }], ["mob", { width: 390, height: 844 }]]) {
    const page = await (await browser.newContext({ viewport })).newPage();
    await page.goto(`${base}/login`);
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar en la plataforma" }).click();
    await page.waitForURL("**/espacios");
    await page.screenshot({ path: `${out}/${name}-espacios.png`, fullPage: true });
    await page.locator("article", { hasText: "Proyectos de Ingeniería 2026" }).getByRole("button", { name: "Entrar al espacio" }).click();
    await page.waitForURL(/\/(equipos|admin)/);
    for (const path of pages) {
      await page.goto(`${base}${path}`);
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: `${out}/${name}${path.replaceAll("/", "-")}.png`, fullPage: name === "desk" });
    }
  }
  await browser.close();
} finally {
  if (eventId) await db.from("events").delete().eq("id", eventId);
  if (userId) { await db.from("audit_log").delete().eq("user_id", userId); await db.auth.admin.deleteUser(userId); }
}

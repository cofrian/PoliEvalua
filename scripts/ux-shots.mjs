// Capturas de las pantallas principales en local (escritorio y móvil) para
// cada rol, con un espacio y unas personas temporales que se borran al terminar.
// Uso: node scripts/ux-shots.mjs <carpeta> [roles separados por comas]
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { loadTestEnv } from "./load-test-env.mjs";

const env = loadTestEnv();
const base = process.env.SHOTS_BASE_URL ?? "http://localhost:3100";
const out = process.argv[2] ?? "shots";
const wanted = (process.argv[3] ?? "teacher,judge,student,public").split(",");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const slug = `ux-${stamp}`;

const people = {
  teacher: { name: "Profesora Demo", pages: ["/espacios", "/admin", "/admin/ajustes", "/admin/personas", "/admin/evaluacion", "/admin/agenda", "/equipos", "/resultados"] },
  judge: { name: "Jurado Demo", pages: ["/equipos", "/equipos/{team}", "/equipos/{team}/evaluar", "/agenda", "/rubrica"] },
  student: { name: "Estudiante Demo", pages: ["/mi-grupo", "/agenda", "/rubrica", "/coevaluacion"] },
};
const ids = {};
let eventId = "";

async function createPerson(key) {
  const email = `ux-${key}-${stamp}@test.local`;
  const password = `Prueba-${stamp}!`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: people[key].name } });
  if (error) throw error;
  await db.from("profiles").update({ disabled: false, full_name: people[key].name }).eq("id", data.user.id);
  ids[key] = { id: data.user.id, email, password };
}

try {
  for (const key of Object.keys(people)) await createPerson(key);
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await anon.auth.signInWithPassword({ email: ids.teacher.email, password: ids.teacher.password });
  const { data: created, error } = await anon.rpc("create_event_space", {
    p_name: "Proyectos de Ingeniería 2026", p_slug: slug, p_kind: "class", p_signup_code: `UX-${stamp}`,
    p_description: "Espacio de capturas",
    p_settings: { participant_mode: "groups", evaluation_mode: "mixed", enabled_roles: ["teacher", "student", "judge"], join_roles: ["student"], modules: ["participants", "rubric", "notes", "results"] },
  });
  if (error) throw error;
  eventId = created;

  await db.from("event_members").insert([
    { event_id: eventId, user_id: ids.judge.id, role: "judge", status: "active" },
    { event_id: eventId, user_id: ids.student.id, role: "student", status: "active" },
  ]);
  const { data: teams } = await db.from("teams").insert([
    { event_id: eventId, name: "Grupo Aurora", number: 1, project_title: "Riego inteligente para huertos urbanos" },
    { event_id: eventId, name: "Grupo Brisa", number: 2, project_title: "Mapa de accesibilidad del campus" },
    { event_id: eventId, name: "Grupo Cierzo", number: 3, project_title: "Reutilización de material de laboratorio" },
  ]).select("id, number").order("number");
  await db.from("team_members").insert([
    { event_id: eventId, team_id: teams[0].id, full_name: people.student.name, email: ids.student.email, user_id: ids.student.id },
    { event_id: eventId, team_id: teams[0].id, full_name: "Marta López" },
    { event_id: eventId, team_id: teams[1].id, full_name: "Pablo Ruiz" },
  ]);
  await db.from("evaluation_pages").update({ status: "published" }).eq("event_id", eventId);
  const team = teams[0].id;

  const browser = await chromium.launch();
  for (const [size, viewport] of [["desk", { width: 1440, height: 900 }], ["mob", { width: 390, height: 844 }]]) {
    for (const key of wanted.filter((role) => people[role])) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await page.goto(`${base}/login`);
      await page.getByLabel("Correo electrónico").fill(ids[key].email);
      await page.getByLabel("Contraseña").fill(ids[key].password);
      await page.getByRole("button", { name: "Entrar en la plataforma" }).click();
      await page.waitForURL(/\/(espacios|equipos|admin|mi-grupo)/);
      if (page.url().includes("/espacios")) {
        await page.locator("article", { hasText: "Proyectos de Ingeniería 2026" }).getByRole("button", { name: "Entrar al espacio" }).click();
        await page.waitForURL(/\/(equipos|admin|mi-grupo)/);
      }
      for (const path of people[key].pages) {
        const url = path.replace("{team}", team);
        await page.goto(`${base}${url}`);
        await page.waitForLoadState("networkidle");
        const dialog = page.getByRole("button", { name: /Entendido|Acepto/ });
        if (await dialog.isVisible().catch(() => false)) await dialog.click();
        await page.screenshot({ path: `${out}/${size}-${key}${path.replaceAll("/", "-").replace("{team}", "grupo")}.png`, fullPage: size === "desk" });
      }
      await context.close();
    }
    if (wanted.includes("public")) {
      const page = await (await browser.newContext({ viewport })).newPage();
      await page.goto(`${base}/votar/${slug}`);
      await page.screenshot({ path: `${out}/${size}-public-votar.png`, fullPage: true });
      await page.goto(`${base}/login`);
      await page.screenshot({ path: `${out}/${size}-public-login.png`, fullPage: true });
      await page.context().close();
    }
  }
  await browser.close();
} finally {
  if (eventId) await db.from("events").delete().eq("id", eventId);
  for (const { id } of Object.values(ids)) {
    await db.from("audit_log").delete().eq("user_id", id);
    await db.auth.admin.deleteUser(id);
  }
}

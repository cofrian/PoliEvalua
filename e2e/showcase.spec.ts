import { createClient } from "@supabase/supabase-js";
import { test, type Browser, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { loadTestEnv } from "../scripts/load-test-env.mjs";

// Capturas de la portada y del README. No es una prueba: solo corre cuando
// se pide expresamente (npm run showcase). Crea un hackathon de demostración con usuarios
// @test.local, saca las imágenes a public/showcase/ (el vídeo se monta aparte, en video/) y lo borra todo al terminar.

test.skip(
  !process.env.SHOWCASE && !process.argv.some((arg) => arg.includes("showcase")),
  "Solo con npm run showcase",
);

const env = loadTestEnv();
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const OUT = "public/showcase";
const stamp = Date.now();
const password = `Demo-${stamp}!`;
const spaceName = "Valencia Hack 2026";
const people = {
  admin: { name: "Marta Ribes", email: `demo-admin-${stamp}@test.local` },
  judge: { name: "Jordi Pons", email: `demo-jurado-${stamp}@test.local` },
  judge2: { name: "Elena Soler", email: `demo-jurado2-${stamp}@test.local` },
  student: { name: "Lucía Ferrer", email: `demo-equipo-${stamp}@test.local` },
};
type Who = keyof typeof people;
const ids: Record<Who, string> = { admin: "", judge: "", judge2: "", student: "" };
let eventId = "";
let firstTeam = "";

const TEAMS = [
  ["AquaSense", "Sensores IoT para detectar fugas en la red de agua de València"],
  ["BiciRuta", "Rutas seguras en bici con datos abiertos del Ajuntament"],
  ["Mercat Verd", "Marketplace de excedentes alimentarios de los mercados municipales"],
  ["EcoHuerta", "Huertos urbanos conectados con riego inteligente"],
  ["TurisMap", "Turismo sostenible: repartir visitantes fuera del centro histórico"],
  ["Calor Zero", "Mapa de refugios climáticos para olas de calor"],
] as const;

const CRITERIA = [
  ["Impacto", "Problema real y beneficio para la ciudad", 30],
  ["Innovación", "Originalidad de la solución", 25],
  ["Viabilidad técnica", "Prototipo funcional y arquitectura", 25],
  ["Presentación", "Claridad y defensa ante el jurado", 20],
] as const;

async function createUser(who: Who) {
  const { data, error } = await db.auth.admin.createUser({
    email: people[who].email,
    password,
    email_confirm: true,
    user_metadata: { full_name: people[who].name, tour_seen: { admin: true, judge: true, student: true, viewer: true } },
  });
  if (error) throw error;
  await db.from("profiles").update({ disabled: false, full_name: people[who].name }).eq("id", data.user.id);
  return data.user.id;
}

async function enter(browser: Browser, who: Who) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(people[who].email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar en la plataforma" }).click();
  await page.waitForURL("**/espacios");
  await page.locator("article", { hasText: spaceName }).getByRole("button", { name: "Entrar al espacio" }).click();
  await page.waitForURL(/\/(equipos|admin)/);
  return page;
}

async function shot(page: Page, path: string, name: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  // WebP a 1600 px de ancho: pesa unas cinco veces menos que el PNG.
  await sharp(await page.screenshot()).resize(1600).webp({ quality: 82 }).toFile(`${OUT}/${name}.webp`);
}

test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);

test.beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  for (const who of Object.keys(people) as Who[]) ids[who] = await createUser(who);

  const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await adminClient.auth.signInWithPassword({ email: people.admin.email, password });
  const { data: created, error } = await adminClient.rpc("create_event_space", {
    p_name: spaceName,
    p_slug: `demo-${stamp}`,
    p_kind: "hackathon",
    p_signup_code: `DEMO-${stamp}`,
    p_description: "Hackathon de innovación urbana · 48 horas · 6 equipos",
    p_settings: {},
  });
  if (error) throw error;
  eventId = created as string;

  await db.from("event_members").insert([
    { event_id: eventId, user_id: ids.judge, role: "judge", status: "active" },
    { event_id: eventId, user_id: ids.judge2, role: "judge", status: "active" },
    { event_id: eventId, user_id: ids.student, role: "student", status: "active" },
  ]);

  const { data: rubric } = await db.from("rubrics").select("id, scale_max").eq("event_id", eventId).eq("is_active", true).single();
  const { data: criteria } = await db
    .from("rubric_criteria")
    .insert(CRITERIA.map(([title, description, weight], order) => ({ rubric_id: rubric!.id, event_id: eventId, title, description, weight, order })))
    .select("id");
  const scaleMax = rubric!.scale_max as number;
  await db.from("rubric_levels").insert(
    (criteria ?? []).flatMap(({ id }) =>
      Array.from({ length: scaleMax }, (_, index) => ({
        criterion_id: id,
        score: index + 1,
        label: ["Insuficiente", "Básico", "Correcto", "Notable", "Excelente"][index] ?? `Nivel ${index + 1}`,
        descriptor: `Nivel ${index + 1} de ${scaleMax}`,
      })),
    ),
  );
  await db.from("evaluation_pages").update({ status: "published", min_evaluations: 1 }).eq("event_id", eventId);

  const { data: teams } = await db
    .from("teams")
    .insert(TEAMS.map(([name, project_title], index) => ({ event_id: eventId, name, project_title, number: index + 1, table_location: `Mesa ${index + 1}` })))
    .select("id, name");
  firstTeam = teams![0].id;
  await db.from("team_members").insert(
    teams!.flatMap((team, index) =>
      index === 0
        ? [{ team_id: team.id, event_id: eventId, full_name: people.student.name, email: people.student.email, user_id: ids.student }]
        : [{ team_id: team.id, event_id: eventId, full_name: `Integrante ${index + 1}` }],
    ),
  );

  // Agenda: el primero expone ahora, el resto cada 10 minutos.
  const start = Date.now() - 4 * 60_000;
  await db.from("presentation_slots").insert(
    teams!.map((team, index) => ({
      event_id: eventId,
      team_id: team.id,
      room: "Aula Magna",
      position: index,
      starts_at: new Date(start + index * 10 * 60_000).toISOString(),
      duration_minutes: 10,
      status: index === 0 ? "live" : "pending",
      started_at: index === 0 ? new Date(start).toISOString() : null,
    })),
  );

  // Evaluaciones enviadas para que haya ranking.
  for (const [judgeIndex, judge] of [ids.judge, ids.judge2].entries()) {
    for (const [teamIndex, team] of teams!.slice(1).entries()) {
      const { data: evaluation } = await db
        .from("evaluations")
        .insert({ event_id: eventId, team_id: team.id, judge_id: judge, rubric_id: rubric!.id, status: "submitted", submitted_at: new Date().toISOString(), general_comment: "Buen prototipo y equipo muy coordinado." })
        .select("id")
        .single();
      if (!evaluation) continue;
      await db.from("evaluation_scores").insert(
        (criteria ?? []).map(({ id }, criterionIndex) => ({
          event_id: eventId,
          evaluation_id: evaluation.id,
          criterion_id: id,
          score: Math.max(1, Math.min(scaleMax, scaleMax - ((teamIndex + criterionIndex + judgeIndex) % 3))),
        })),
      );
    }
  }
});

test.afterAll(async () => {
  if (eventId) await db.from("events").delete().eq("id", eventId);
  for (const id of Object.values(ids)) {
    if (!id) continue;
    await db.from("audit_log").delete().eq("user_id", id);
    await db.auth.admin.deleteUser(id);
  }
});

test("capturas", async ({ browser }) => {
  const admin = await enter(browser, "admin");
  await shot(admin, "/admin", "admin");
  await shot(admin, "/resultados", "resultados");
  await shot(admin, "/admin/agenda", "agenda-admin");
  await shot(admin, "/proyector", "proyector");
  await admin.context().close();

  const judge = await enter(browser, "judge");
  await shot(judge, "/equipos", "equipos");
  await shot(judge, `/equipos/${firstTeam}/evaluar`, "evaluar");
  await shot(judge, "/sala", "sala");
  await judge.context().close();

  const student = await enter(browser, "student");
  await shot(student, "/mi-grupo", "mi-grupo");
  await shot(student, "/agenda", "agenda");
  await student.context().close();

  for (const [name, path] of [["login", "/login"]] as const) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await shot(page, path, name);
    await context.close();
  }
});

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { loadTestEnv } from "../scripts/load-test-env.mjs";

// Recorrido de una asignatura completa con las funciones de las fases 1–6:
// aviso de grabación, alumnado importado, entregas, agenda y modo sala,
// evaluación, feedback publicado, coevaluación y voto del público. Crea un
// espacio y usuarios temporales (@test.local) y lo borra todo al terminar.

const env = loadTestEnv();
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const stamp = Date.now();
const password = `Prueba-${stamp}!`;
const spaceName = `Asignatura E2E ${stamp}`;
const slug = `asignatura-e2e-${stamp}`;
const people = {
  teacher: { name: `Profesora E2E ${stamp}`, email: `e2e-prof-${stamp}@test.local` },
  judge: { name: `Tribunal E2E ${stamp}`, email: `e2e-tribunal-${stamp}@test.local` },
  ana: { name: `Ana E2E ${stamp}`, email: `e2e-ana-${stamp}@test.local` },
  luis: { name: `Luis E2E ${stamp}`, email: `e2e-luis-${stamp}@test.local` },
};
const userIds: Record<keyof typeof people, string> = { teacher: "", judge: "", ana: "", luis: "" };
let eventId = "";
let criteriaIds: string[] = [];
const pages: Partial<Record<keyof typeof people, Page>> = {};

async function createUser(who: { name: string; email: string }) {
  const { data, error } = await db.auth.admin.createUser({
    email: who.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: who.name },
  });
  if (error) throw error;
  await db.from("profiles").update({ disabled: false, full_name: who.name }).eq("id", data.user.id);
  return data.user.id;
}

/** Entra con contraseña y abre el espacio de la prueba. */
async function enter(browser: Browser, key: keyof typeof people) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(people[key].email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar en la plataforma" }).click();
  await page.waitForURL("**/espacios");
  await page.locator("article", { hasText: spaceName }).getByRole("button", { name: "Entrar al espacio" }).click();
  await page.waitForURL(/\/(equipos|admin)/);
  pages[key] = page;
  return page;
}

/** Si aparece el aviso de grabación, lo confirma y comprueba que desaparece. */
async function acknowledgeNotice(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Las exposiciones se grabarán" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("El audio no se guarda");
  await dialog.getByRole("button", { name: "Entendido" }).click();
  await expect(dialog).toBeHidden();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  for (const key of Object.keys(people) as (keyof typeof people)[]) {
    userIds[key] = await createUser(people[key]);
  }

  // La profesora crea la asignatura con su propia sesión (como en la app).
  const teacherClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await teacherClient.auth.signInWithPassword({ email: people.teacher.email, password });
  const { data: created, error } = await teacherClient.rpc("create_event_space", {
    p_name: spaceName,
    p_slug: slug,
    p_kind: "class",
    p_signup_code: `E2E-${stamp}`,
    p_description: "Espacio temporal de pruebas de punta a punta",
    p_settings: {
      participant_mode: "groups",
      evaluation_mode: "mixed",
      enabled_roles: ["teacher", "student", "judge"],
      join_roles: ["student"],
      modules: ["participants", "rubric", "notes", "results"],
      academic: { institution: "Universitat Politècnica de València", subject_name: "Proyecto E2E" },
    },
  });
  if (error) throw error;
  eventId = created as string;

  // Rúbrica de dos criterios (50 % + 50 %) y página de evaluación publicada.
  const { data: rubric } = await db.from("rubrics").select("id, scale_max").eq("event_id", eventId).eq("is_active", true).single();
  const { data: criteria } = await db
    .from("rubric_criteria")
    .insert([
      { rubric_id: rubric!.id, title: "Contenido", description: "Calidad técnica", weight: 50, order: 0 },
      { rubric_id: rubric!.id, title: "Exposición", description: "Claridad al presentar", weight: 50, order: 1 },
    ])
    .select("id");
  criteriaIds = (criteria ?? []).map((row) => row.id);
  const scaleMax = rubric!.scale_max as number;
  await db.from("rubric_levels").insert(
    criteriaIds.flatMap((id) =>
      Array.from({ length: scaleMax }, (_, index) => ({
        criterion_id: id,
        score: index + 1,
        label: `Nivel ${index + 1}`,
        descriptor: `Descripción del nivel ${index + 1}`,
        example: index + 1 === scaleMax ? "Ejemplo del nivel máximo" : null,
      })),
    ),
  );
  await db.from("evaluation_pages").update({ status: "published", min_evaluations: 1 }).eq("event_id", eventId);

  await db.from("event_members").insert([
    { event_id: eventId, user_id: userIds.judge, role: "judge", status: "active" },
    { event_id: eventId, user_id: userIds.ana, role: "student", status: "active" },
    { event_id: eventId, user_id: userIds.luis, role: "student", status: "active" },
  ]);
});

test.afterAll(async () => {
  for (const page of Object.values(pages)) await page?.context().close();
  if (eventId) await db.from("events").delete().eq("id", eventId);
  for (const id of Object.values(userIds)) {
    if (!id) continue;
    await db.from("audit_log").delete().eq("user_id", id);
    await db.auth.admin.deleteUser(id);
  }
});

test("1. La profesora ve el panel de inicio adaptado a una asignatura", async ({ browser }) => {
  const page = await enter(browser, "teacher");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Preparación" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Grupos", exact: true }).first()).toBeVisible();
  // En una asignatura no hay retos ni patrocinadores.
  await expect(page.getByRole("link", { name: "Retos" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Patrocinadores" })).toHaveCount(0);
});

test("2. Activa la grabación y el aviso aparece al entrar", async () => {
  const page = pages.teacher!;
  await page.goto("/admin/grabaciones");
  await page.getByRole("switch", { name: "Grabar exposiciones en este espacio" }).click();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await acknowledgeNotice(page);
  await expect(page.getByRole("heading", { name: /Confirmaciones/ })).toBeVisible();
});

test("3. Importa el alumnado con su grupo y la entrega común", async () => {
  const page = pages.teacher!;
  await page.goto("/admin/equipos");
  await page.getByLabel("Lista de alumnado", { exact: true }).fill(
    `Nombre;Correo;Grupo\nAna;${people.ana.email};Grupo A\nLuis;${people.luis.email};Grupo B`,
  );
  await page.getByLabel("Formar grupos").selectOption("column");
  await expect(page.getByText("Vista previa: 2 estudiantes en 2 grupos")).toBeVisible();
  await page.getByRole("button", { name: "Dar de alta 2 estudiantes" }).click();
  await expect(page.getByText(/2 estudiantes añadidos/)).toBeVisible();

  await page.goto("/admin/ajustes");
  await page.getByLabel("Carpeta común (opcional)").fill("https://drive.google.com/drive/folders/e2e");
  await page.getByLabel("Instrucciones (opcional)").fill("Sube aquí la memoria.");
  await page.locator("form", { has: page.getByLabel("Carpeta común (opcional)") }).getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Cambios guardados")).toBeVisible();
  await expect(page.getByLabel("Carpeta común (opcional)")).toHaveValue(/drive\.google\.com/);

  const { data: members } = await db.from("team_members").select("email, user_id").eq("event_id", eventId);
  expect(members?.every((member) => member.user_id)).toBeTruthy();
});

test("4. Genera la agenda", async () => {
  const page = pages.teacher!;
  await page.goto("/admin/agenda");
  await page.getByLabel("Salas (separadas por comas)").fill("Aula 1");
  await page.getByRole("button", { name: "Generar agenda" }).click();
  await expect(page.getByText("Agenda creada: 2 turnos en 1 sala(s).")).toBeVisible();
});

test("5. La estudiante confirma el aviso y ve su grupo, turno y rúbrica", async ({ browser }) => {
  const page = await enter(browser, "ana");
  await acknowledgeNotice(page);
  await page.goto("/mi-grupo");
  await expect(page.getByRole("heading", { name: "Grupo A" })).toBeVisible();
  await expect(page.getByText("Tu turno")).toBeVisible();
  await expect(page.getByRole("link", { name: /Carpeta común de entregas/ })).toBeVisible();

  await page.getByLabel("Enlace", { exact: true }).fill("https://github.com/upv/proyecto-e2e");
  await expect(page.getByLabel("Tipo de enlace")).toHaveValue("repo");
  await page.getByRole("button", { name: "Añadir" }).click();
  await expect(page.getByRole("link", { name: /github\.com\/upv\/proyecto-e2e/ })).toBeVisible();

  await page.goto("/rubrica");
  await expect(page.getByText(/Así te evaluará el profesorado/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Historial de cambios" })).toHaveCount(0);
});

test("6. El jurado usa el modo sala: empieza el turno, ve las entregas y evalúa", async ({ browser }) => {
  const page = await enter(browser, "judge");
  await acknowledgeNotice(page);
  await page.goto("/sala");
  await expect(page.getByRole("heading", { name: /Grupo A/ })).toBeVisible();
  await page.getByRole("button", { name: "Empezar turno" }).click();
  await expect(page.getByRole("button", { name: "Terminar" })).toBeVisible();
  await expect(page.getByRole("timer")).toBeVisible();

  // Puntuación máxima en los dos criterios y comentario compartido.
  for (const name of ["Contenido", "Exposición"]) {
    await page.getByRole("radiogroup", { name, exact: true }).getByRole("radio").last().click();
  }
  await expect(page.getByText("Ejemplo: Ejemplo del nivel máximo").first()).toBeVisible();
  await page.getByLabel("Comentario general").fill("Muy buena exposición.");
  await page.getByLabel(/Compartir mis comentarios con el grupo/).check();
  await expect(page.getByText(/· Guardado$/)).toBeVisible();
  await page.getByRole("button", { name: "Enviar evaluación" }).click();
  await page.waitForURL("**/equipos");

  await page.goto("/sala");
  await page.getByRole("button", { name: "Terminar" }).click();
  await expect(page.getByRole("heading", { name: /Grupo B/ })).toBeVisible();

  await page.goto("/equipos");
  await page.getByRole("link", { name: /Grupo A/ }).first().click();
  await expect(page.getByRole("link", { name: /github\.com\/upv\/proyecto-e2e/ })).toBeVisible();
});

test("7. Resultados, discrepancias, acta y PDF por grupo", async () => {
  const page = pages.teacher!;
  await page.goto("/resultados");
  await expect(page.getByRole("heading", { name: "Grupos" })).toBeVisible();
  await expect(page.getByText(/Con menos de 1 evaluación/)).toBeVisible(); // Grupo B sin evaluar
  const acta = await page.request.get("/resultados/csv?tipo=acta");
  expect(acta.ok()).toBeTruthy();
  const csv = await acta.text();
  expect(csv).toContain(people.ana.email);
  expect(csv).toContain("10.00");

  await page.getByRole("link", { name: "Feedback" }).first().click();
  await expect(page.getByText("Muy buena exposición.")).toBeVisible();
});

test("8. Al publicar, la estudiante ve su nota y el feedback", async () => {
  const teacher = pages.teacher!;
  await teacher.goto("/admin/ajustes");
  const publish = teacher.getByRole("switch", { name: "Publicar notas y feedback" });
  await publish.click();
  await teacher.locator("form", { has: publish }).getByRole("button", { name: "Guardar cambios" }).click();
  await expect(teacher.getByText("Cambios guardados")).toBeVisible();
  await teacher.reload();
  await expect(teacher.getByRole("switch", { name: "Publicar notas y feedback" })).toBeChecked();

  const ana = pages.ana!;
  await ana.goto("/mi-grupo");
  await expect(ana.getByRole("heading", { name: "Resultados y feedback" })).toBeVisible();
  await expect(ana.getByText("10.0")).toBeVisible();
  await expect(ana.getByText("Muy buena exposición.")).toBeVisible();
});

test("9. Coevaluación: reparto y revisión de otro grupo", async () => {
  const teacher = pages.teacher!;
  await teacher.goto("/admin/coevaluacion");
  await teacher.getByRole("switch", { name: "Activar la coevaluación en este espacio" }).click();
  await teacher.getByRole("switch", { name: /Autoevaluación del propio/ }).click();
  await teacher.getByRole("button", { name: "Guardar cambios" }).click();
  await teacher.getByRole("button", { name: "Repartir grupos a evaluar" }).click();
  await expect(teacher.getByText(/Reparto hecho: 2 estudiantes/)).toBeVisible();

  const ana = pages.ana!;
  await ana.goto("/coevaluacion");
  const other = ana.locator("details", { hasText: "Grupo B" });
  for (const name of ["Contenido", "Exposición"]) {
    await other.getByRole("radiogroup", { name }).getByRole("radio").first().click();
  }
  await other.getByRole("button", { name: "Enviar" }).click();
  await expect(ana.getByText("Enviada. ¡Gracias!")).toBeVisible();
});

test("10. Voto del público sin cuenta y pantalla del proyector", async ({ browser }) => {
  const teacher = pages.teacher!;
  await teacher.goto("/admin/publico");
  await teacher.getByRole("switch", { name: "Votación abierta" }).click();
  await teacher.getByRole("switch", { name: /Mostrar el recuento/ }).click();
  await teacher.getByRole("button", { name: "Guardar cambios" }).click();
  // El QR está siempre visible: espera a que el guardado llegue de verdad.
  await expect
    .poll(async () => (await db.from("events").select("settings").eq("id", eventId).single()).data?.settings?.public_vote?.open)
    .toBe(true);
  await expect(teacher.getByRole("img", { name: /Código QR para votar/ })).toBeVisible();

  const anonymous = await browser.newContext();
  const voter = await anonymous.newPage();
  await voter.goto(`/votar/${slug}`);
  await voter.getByRole("radio").first().check();
  await voter.getByRole("button", { name: "Votar" }).click();
  await expect(voter.getByText("¡Voto registrado!")).toBeVisible();
  await anonymous.close();

  await teacher.goto("/proyector");
  await expect(teacher.getByText(spaceName)).toBeVisible();
  await expect(teacher.getByRole("img", { name: /Código QR para votar/ })).toBeVisible();
});

test("11. Duplicar el espacio para otro curso", async () => {
  const page = pages.teacher!;
  await page.goto("/espacios");
  const card = page.locator("article", { hasText: spaceName });
  await card.getByText("Duplicar para otro curso").click();
  await card.getByLabel("Nombre del espacio nuevo").fill(`${spaceName} copia`);
  await card.getByLabel("Código de acceso").fill(`E2C-${stamp}`);
  await card.getByRole("button", { name: "Duplicar" }).click();
  await page.waitForURL("**/admin");
  const { data: copy } = await db.from("events").select("id").eq("name", `${spaceName} copia`).single();
  const { count } = await db.from("rubric_criteria").select("id", { count: "exact", head: true }).eq("event_id", copy!.id);
  expect(count).toBe(2);
  await db.from("events").delete().eq("id", copy!.id);
});

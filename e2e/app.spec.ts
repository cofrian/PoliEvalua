import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { loadTestEnv } from "../scripts/load-test-env.mjs";

// Recorre la app como lo harán el jurado, los mentores y el admin, contra la
// base de datos real. Crea usuarios de prueba (correo @test.local) y los borra
// al terminar junto con sus notas y evaluaciones.

const env = loadTestEnv();
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL!,
  env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
  },
);

const stamp = Date.now();
const people = {
  judge: {
    name: `Jueza Prueba ${stamp}`,
    email: `e2e-juez-${stamp}@test.local`,
  },
  mentor: {
    name: `Mentor Prueba ${stamp}`,
    email: `e2e-mentor-${stamp}@test.local`,
  },
  admin: {
    name: `Admin Prueba ${stamp}`,
    email: `e2e-admin-${stamp}@test.local`,
  },
  invited: {
    name: `Invitada Prueba ${stamp}`,
    email: `e2e-invitada-${stamp}@test.local`,
  },
  account: {
    name: `Cuenta Prueba ${stamp}`,
    email: `e2e-cuenta-${stamp}@test.local`,
  },
  student: {
    name: `Estudiante Prueba ${stamp}`,
    email: `e2e-estudiante-${stamp}@test.local`,
  },
  classOwner: {
    name: `Docente Propietaria ${stamp}`,
    email: `e2e-docente-${stamp}@test.local`,
  },
};
const privateText = `Nota privada ${stamp}`;
const sharedText = `Nota compartida ${stamp}`;
const liveText = `Nota en directo ${stamp}`;
const testPassword = `Prueba-${stamp}!`;
const createdUserIds = new Set<string>();
const createdEventIds = new Set<string>();

let accessCode = "";
let eventId = "";
let team: { id: string; name: string };
let secondTeam: { id: string; name: string };
let criteriaCount = 0;
let judgePage: Page;
let mentorPage: Page;
let adminPage: Page;

async function rememberUser(email: string) {
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((candidate) => candidate.email === email);
  if (!user) throw new Error(`No se creó el usuario ${email}`);
  createdUserIds.add(user.id);
  return user;
}

async function register(
  browser: Browser,
  who: { name: string; email: string },
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/registro");
  await page.getByLabel("Nombre completo").fill(who.name);
  await page.getByLabel("Correo electrónico").fill(who.email);
  await page.getByLabel("Contraseña").fill(testPassword);
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();
  await page.waitForURL("**/espacios");
  const user = await rememberUser(who.email);
  // El tutorial de bienvenida se prueba aparte; aquí taparía la pantalla.
  await db.auth.admin.updateUserById(user.id, {
    user_metadata: { full_name: who.name, tour_seen: { admin: true, judge: true, student: true, viewer: true } },
  });
  return page;
}

async function joinSpace(page: Page, role: "Juez" | "Mentor") {
  await page.getByLabel("Código del espacio").fill(accessCode);
  await page.getByLabel("Participaré como").selectOption(role === "Juez" ? "judge" : "mentor");
  await page.getByRole("button", { name: "Entrar al espacio" }).click();
  await page.waitForURL("**/equipos");
}

async function login(browser: Browser, who: { email: string }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(who.email);
  await page.getByLabel("Contraseña").fill(testPassword);
  await page.getByRole("button", { name: "Entrar en la plataforma" }).click();
  await page.waitForURL("**/espacios");
  const card = page.locator("article", { hasText: "València Hack" });
  await card.getByRole("button", { name: "Entrar al espacio" }).click();
  await page.waitForURL("**/equipos");
  return page;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  if (
    process.env.E2E_BASE_URL?.startsWith("http://localhost") ||
    process.env.E2E_BASE_URL?.startsWith("http://127.0.0.1")
  ) {
    // Las ejecuciones locales comparten la IP loopback. Se limpian únicamente
    // sus contadores para que una ejecución anterior no bloquee la siguiente.
    await db
      .from("auth_attempts")
      .delete()
      .in("key", ["ip:::1", "ip:127.0.0.1", "ip:desconocida"]);
  }

  const { data: event } = await db
    .from("events")
    .select("id, signup_code, status")
    .eq("slug", "valencia-hack")
    .single();
  eventId = event!.id;
  accessCode = event!.signup_code;
  expect(event!.status, "el evento no debe estar cerrado para probar").not.toBe(
    "closed",
  );

  // Solo los equipos de este espacio (antes cogía los de cualquiera).
  const { data: teams } = await db
    .from("teams")
    .select("id, name")
    .eq("event_id", eventId)
    .order("number")
    .limit(2);
  [team, secondTeam] = teams as { id: string; name: string }[];

  const { data: rubric } = await db
    .from("rubrics")
    .select("rubric_criteria(id, deleted_at)")
    .eq("event_id", eventId)
    .eq("is_active", true)
    .single();
  criteriaCount = (
    rubric!.rubric_criteria as { deleted_at: string | null }[]
  ).filter((c) => !c.deleted_at).length;
});

test.afterAll(async () => {
  for (const eventId of createdEventIds) {
    await db.from("events").delete().eq("id", eventId);
  }
  for (const userId of createdUserIds) {
    await db.from("notes").delete().eq("author_id", userId);
    await db.from("audit_log").delete().eq("user_id", userId);
    await db.from("event_invitations").delete().eq("created_by", userId);
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error)
      console.warn(
        `No se pudo borrar el usuario E2E ${userId}: ${error.message}`,
      );
  }
});

test("1. Portada y acceso con contraseña", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Crea el proceso de evaluación/ }),
  ).toBeVisible();
  await expect(page.getByText("Next.js")).toHaveCount(0);
  await page.getByRole("link", { name: "Entrar" }).click();
  await expect(page.getByLabel("Código de acceso")).toHaveCount(0);
  await expect(page.getByLabel("Nombre completo")).toHaveCount(0);
  await expect(page.getByLabel("Contraseña")).toBeVisible();
  await expect(page.getByRole("link", { name: "Crear cuenta" })).toBeVisible();
  await expect(
    page.getByAltText(/Universitat Politècnica de València/).first(),
  ).toBeVisible();
});

test("2. Un usuario inexistente no puede entrar", async ({ page }) => {
  await page.goto("/login");
  await page
    .getByLabel("Correo electrónico")
    .fill(`e2e-intruso-${stamp}@test.local`);
  await page.getByLabel("Contraseña").fill(testPassword);
  await page.getByRole("button", { name: "Entrar en la plataforma" }).click();
  await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("3. Sin sesión, las páginas internas llevan al acceso", async ({
  page,
}) => {
  for (const path of [
    "/equipos",
    "/rubrica",
    "/resultados",
    "/admin",
    "/perfil",
    "/espacios",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("4. El juez entra y ve los equipos", async ({ browser }) => {
  judgePage = await register(browser, people.judge);
  await expect(judgePage.getByText("Tu cuenta ya está lista")).toBeVisible();
  await joinSpace(judgePage, "Juez");
  await expect(
    judgePage.getByRole("heading", { name: "Equipos" }),
  ).toBeVisible();
  await expect(
    judgePage.getByText("Juez", { exact: true }).first(),
  ).toBeVisible();
  await expect(judgePage.getByRole("link", { name: team.name })).toBeVisible();
  // Filtro y buscador
  await judgePage.getByLabel("Buscar equipo").fill(team.name);
  await expect(
    judgePage.getByRole("link", { name: secondTeam.name }),
  ).toHaveCount(0);
  await judgePage.getByLabel("Buscar equipo").fill("");
  // Sin acceso de admin
  await expect(judgePage.getByRole("link", { name: "Resumen" })).toHaveCount(0);
});

test("5. El juez crea una nota privada y otra compartida", async () => {
  await judgePage.goto(`/equipos/${team.id}`);
  await judgePage.getByLabel("Nueva nota").fill(privateText);
  await judgePage.getByRole("button", { name: "Añadir nota" }).click();
  await expect(judgePage.getByText(privateText)).toBeVisible();

  await judgePage.getByLabel("Nueva nota").fill(sharedText);
  await judgePage.getByRole("button", { name: /Privada/ }).click();
  await judgePage.getByRole("button", { name: "Añadir nota" }).click();
  await expect(judgePage.getByText(sharedText)).toBeVisible();
});

test("6. El mentor entra: ve lo compartido, no lo privado, y no puede votar", async ({
  browser,
}) => {
  mentorPage = await register(browser, people.mentor);
  await joinSpace(mentorPage, "Mentor");
  await expect(
    mentorPage.getByText("Mentor", { exact: true }).first(),
  ).toBeVisible();

  await mentorPage.goto(`/equipos/${team.id}`);
  await expect(mentorPage.getByText(sharedText)).toBeVisible();
  await expect(mentorPage.getByText(privateText)).toHaveCount(0);
  await expect(mentorPage.getByRole("link", { name: /Evaluar/ })).toHaveCount(
    0,
  );

  await mentorPage.goto(`/equipos/${team.id}/evaluar`);
  await expect(mentorPage.getByText(/no votar/)).toBeVisible();

  await mentorPage.goto("/rubrica");
  await expect(
    mentorPage.getByText(/Solo las personas propietarias y gestoras pueden cambiar/),
  ).toBeVisible();
  await expect(
    mentorPage.getByRole("button", { name: "Añadir criterio" }),
  ).toHaveCount(0);

  await mentorPage.goto("/admin");
  await expect(mentorPage).toHaveURL(/\/equipos/);
});

test("7. Las notas compartidas llegan en directo", async () => {
  await mentorPage.goto(`/equipos/${team.id}`);
  await expect(mentorPage.getByText(sharedText)).toBeVisible();
  await mentorPage.waitForTimeout(2_000); // suscripción en tiempo real activa

  await judgePage.getByLabel("Nueva nota").fill(liveText);
  await expect(
    judgePage.getByRole("button", { name: /Compartida/ }),
  ).toBeVisible();
  await judgePage.getByRole("button", { name: "Añadir nota" }).click();

  // Sin recargar la página del mentor
  await expect(mentorPage.getByText(liveText)).toBeVisible();
});

test("8. El juez evalúa: nota en vivo, autoguardado y envío", async () => {
  await judgePage.goto(`/equipos/${team.id}/evaluar`);
  const groups = judgePage.getByRole("radiogroup");
  await expect(groups).toHaveCount(criteriaCount);

  // Enviar sin completar no se permite
  await groups.nth(0).getByRole("radio").nth(2).click();
  await judgePage.getByRole("button", { name: "Enviar evaluación" }).click();
  await expect(
    judgePage.getByText("Completa los requisitos, las preguntas obligatorias y todos los criterios."),
  ).toBeVisible();

  for (let i = 1; i < criteriaCount; i++) {
    await groups.nth(i).getByRole("radio").nth(2).click(); // un 3 en todo
  }
  await expect(judgePage.getByText("60.0")).toBeVisible(); // 3/5 de 100
  await expect(judgePage.getByText(/Guardado/)).toBeVisible();

  await judgePage.getByRole("button", { name: "Enviar evaluación" }).click();
  await judgePage.waitForURL("**/equipos");
  const card = judgePage.getByRole("link", { name: new RegExp(team.name) });
  await expect(card.getByText("✔ Evaluado")).toBeVisible();

  const { data } = await db
    .from("evaluation_totals")
    .select("total, status")
    .eq("team_id", team.id)
    .eq("status", "submitted");
  expect(data!.some((row) => Number(row.total) === 60)).toBe(true);
});

test("9. El juez puede usar la rúbrica y su perfil", async () => {
  await judgePage.goto("/rubrica");
  await expect(judgePage.getByText(/Suma de pesos/)).toBeVisible();
  await expect(judgePage.getByText(/100 % ✔/)).toBeVisible();

  await judgePage.goto("/perfil");
  await judgePage.getByLabel("Organización").fill("Organización de prueba");
  await judgePage.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(judgePage.getByText("Perfil guardado.")).toBeVisible();

  await judgePage.goto("/resultados");
  await expect(judgePage).toHaveURL(/\/equipos/); // resultados solo tras el cierre
});

test("10. El propietario entra con su cuenta y ve lo privado", async ({
  browser,
}) => {
  adminPage = await register(browser, people.admin);
  const adminUser = await rememberUser(people.admin.email);
  const { error } = await db.from("event_members").insert({
    event_id: eventId,
    user_id: adminUser.id,
    role: "owner",
    status: "active",
  });
  if (error) throw error;
  await adminPage.reload();
  const eventCard = adminPage.locator("article", { hasText: "València Hack" });
  await eventCard.getByRole("button", { name: "Entrar al espacio" }).click();
  await adminPage.waitForURL("**/equipos");
  await expect(
    adminPage.getByText("Propietario", { exact: true }).first(),
  ).toBeVisible();

  await adminPage.goto(`/equipos/${team.id}`);
  await expect(adminPage.getByText(privateText)).toBeVisible();
  await expect(adminPage.getByText(sharedText)).toBeVisible();
  await expect(adminPage.getByText("Editar equipo")).toBeVisible();
});

test("11. El admin ve las votaciones en directo", async () => {
  await adminPage.goto("/resultados");
  await expect(
    adminPage.getByRole("heading", { name: "Votaciones en directo" }),
  ).toBeVisible();
  const live = adminPage.locator("section", {
    has: adminPage.getByText("Votaciones en directo"),
  });
  await expect(live.getByText(people.judge.name).first()).toBeVisible();
  await expect(
    adminPage.getByText("En directo", { exact: true }),
  ).toBeVisible();
  await adminPage.waitForTimeout(2_000);

  // El juez empieza otro equipo: aparece como borrador sin recargar
  await judgePage.goto(`/equipos/${secondTeam.id}/evaluar`);
  await judgePage
    .getByRole("radiogroup")
    .nth(0)
    .getByRole("radio")
    .nth(4)
    .click();
  await expect(judgePage.getByText(/Guardado/)).toBeVisible();

  const judgeDraft = live
    .getByRole("row")
    .filter({ hasText: people.judge.name })
    .filter({ hasText: secondTeam.name });
  await expect(judgeDraft).toContainText("Borrador");
});

test("12. Ranking, CSV y PDF", async () => {
  await adminPage.goto("/resultados");
  await expect(
    adminPage.getByRole("button", { name: "Descargar PDF" }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole("row", { name: new RegExp(team.name) }).first(),
  ).toBeVisible();

  const perJudge = await adminPage.request.get("/resultados/csv");
  expect(perJudge.status()).toBe(200);
  expect(await perJudge.text()).toContain(people.judge.name);

  const ranking = await adminPage.request.get("/resultados/csv?tipo=ranking");
  expect(ranking.status()).toBe(200);
  expect(await ranking.text()).toContain(team.name);

  const forbidden = await judgePage.request.get("/resultados/csv");
  expect(forbidden.status()).toBe(403);
});

test("13. El admin puede editar la rúbrica y gestionar todo", async () => {
  await adminPage.goto("/rubrica");
  await expect(
    adminPage.getByRole("button", { name: "Añadir criterio" }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole("button", { name: /loquear rúbrica/ }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole("button", { name: "Editar" }).first(),
  ).toBeVisible();

  await adminPage.goto("/admin/ajustes");
  await expect(
    adminPage.getByRole("heading", { name: "General" }),
  ).toBeVisible();
  await adminPage.goto("/admin/personas");
  await expect(adminPage.getByText(people.judge.name)).toBeVisible();
  await expect(adminPage.getByText(people.mentor.name)).toBeVisible();

  await adminPage.goto("/admin/equipos");
  // La importación vive en una ventana que se abre desde la lista.
  await adminPage.getByRole("button", { name: "Importar lista" }).first().click();
  await expect(adminPage.getByText(/Importar equipos/)).toBeVisible();
  await adminPage.keyboard.press("Escape");
  await expect(adminPage.getByText(team.name).first()).toBeVisible();

  await adminPage.goto("/admin/retos");
  await expect(
    adminPage.getByRole("heading", { name: "Nuevo reto" }),
  ).toBeVisible();

  await adminPage.goto("/admin/patrocinadores");
  await expect(
    adminPage.getByAltText("Ajuntament de València").first(),
  ).toBeVisible();

  await adminPage.goto("/admin/auditoria");
  await expect(adminPage.getByRole("table")).toBeVisible();
});

test("14. El propietario crea otro espacio sin mezclar sus equipos", async () => {
  const name = `Espacio aislado ${stamp}`;
  const slug = `espacio-aislado-${stamp}`;
  await adminPage.goto("/espacios/nuevo");
  await adminPage.getByLabel("Nombre del espacio").fill(name);
  await adminPage.getByText("Proyectos", { exact: true }).click();
  await adminPage.getByLabel("Identificador web").fill(slug);
  await adminPage.getByLabel("Código inicial").fill(`ESP-${stamp}`);
  await adminPage.getByRole("button", { name: "Crear espacio" }).click();
  await adminPage.waitForURL("**/admin");

  const { data: created } = await db
    .from("events")
    .select("id")
    .eq("slug", slug)
    .single();
  createdEventIds.add(created!.id);

  await adminPage.goto("/equipos");
  await expect(adminPage.getByRole("link", { name: team.name })).toHaveCount(0);

  await adminPage.goto("/espacios");
  await expect(adminPage.getByRole("heading", { name })).toBeVisible();
  const originalCard = adminPage.locator("article", { hasText: "València Hack" });
  await originalCard.getByRole("button", { name: "Entrar al espacio" }).click();
  await adminPage.waitForURL("**/equipos");
  await expect(adminPage.getByRole("link", { name: team.name })).toBeVisible();
});

test("15. Una invitación personal concede solo su rol y espacio", async ({ browser }) => {
  await adminPage.goto("/admin/personas");
  await adminPage.getByLabel("Correo").fill(people.invited.email);
  await adminPage.getByLabel("Rol", { exact: true }).selectOption("mentor");
  await adminPage.getByRole("button", { name: "Crear enlace" }).click();
  const inviteLink = await adminPage.getByLabel("Enlace de invitación").inputValue();

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(inviteLink);
  await expect(page.getByLabel("Código de acceso")).toHaveCount(0);
  await page.getByRole("link", { name: "Crear cuenta" }).click();
  await page.getByLabel("Nombre completo").fill(people.invited.name);
  await page.getByLabel("Correo electrónico").fill(people.invited.email);
  await page.getByLabel("Contraseña").fill(testPassword);
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();
  await page.waitForURL("**/espacios");
  const invitedCard = page.locator("article", { hasText: "València Hack" });
  await invitedCard.getByRole("button", { name: "Entrar al espacio" }).click();
  await page.waitForURL("**/equipos");
  await expect(page.getByText("Mentor", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: team.name })).toBeVisible();

  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const invited = data.users.find((user) => user.email === people.invited.email);
  if (!invited) throw new Error("No se creó la cuenta invitada");
  createdUserIds.add(invited.id);
  await context.close();
});

test("16. Volver a entrar recupera las notas (mismo correo)", async ({
  browser,
}) => {
  const again = await login(browser, people.judge);
  await expect(again.getByText("Juez", { exact: true }).first()).toBeVisible();
  await again.goto(`/equipos/${team.id}`);
  await expect(again.getByText(privateText)).toBeVisible();
});

test("17. Instalable como app (PWA)", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  expect((await manifest.json()).icons.length).toBeGreaterThan(0);
  expect((await request.get("/sw.js")).status()).toBe(200);
  expect((await request.get("/offline.html")).status()).toBe(200);
});

test("18. Una cuenta general puede registrarse, salir y volver a entrar", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/registro");
  await page.getByLabel("Nombre completo").fill(people.account.name);
  await page.getByLabel("Correo electrónico").fill(people.account.email);
  await page.getByLabel("Contraseña").fill(testPassword);
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();
  await page.waitForURL("**/espacios");
  await expect(page.getByText("Tu cuenta ya está lista")).toBeVisible();
  await rememberUser(people.account.email);

  await page.getByRole("button", { name: "Menú de usuario" }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await page.waitForURL("**/login");
  await page.getByLabel("Correo electrónico").fill(people.account.email);
  await page.getByLabel("Contraseña").fill(testPassword);
  await page.getByRole("button", { name: "Entrar en la plataforma" }).click();
  await page.waitForURL("**/espacios");
  await expect(page.getByText("Tu cuenta ya está lista")).toBeVisible();

  await context.close();
});

test("19. La plantilla de asignatura permite alumnado y bloquea roles no autorizados", async ({ browser }) => {
  const name = `Asignatura prueba ${stamp}`;
  const slug = `asignatura-prueba-${stamp}`;
  const code = `CLASE-${stamp}`;

  const ownerPage = await register(browser, people.classOwner);
  await ownerPage.goto("/espacios/nuevo");
  await ownerPage.getByText("Asignatura", { exact: true }).click();
  await ownerPage.getByLabel("Nombre del espacio").fill(name);
  await ownerPage.getByLabel("Identificador web").fill(slug);
  await ownerPage.getByLabel("Código inicial").fill(code);
  await ownerPage.locator('input[name="degree"]').fill("Grado en Ingeniería Informática");
  await ownerPage.locator('input[name="subjectName"]').fill("Proyectos de Inteligencia Artificial");
  await expect(ownerPage.locator('input[name="enabledRoles"][value="student"]')).toBeChecked();
  await expect(ownerPage.locator('input[name="joinRoles"][value="student"]')).toBeChecked();
  await ownerPage.getByRole("button", { name: "Crear espacio" }).click();
  await ownerPage.waitForURL("**/admin");

  const { data: created, error: eventError } = await db
    .from("events")
    .select("id, settings")
    .eq("slug", slug)
    .single();
  if (eventError) throw eventError;
  createdEventIds.add(created.id);
  expect(created.settings).toMatchObject({
    participant_mode: "groups",
    evaluation_mode: "mixed",
    enabled_roles: ["teacher", "student"],
    join_roles: ["student"],
    modules: ["participants", "rubric", "notes", "results"],
    academic: {
      institution: "Universitat Politècnica de València",
      degree: "Grado en Ingeniería Informática",
      subject_name: "Proyectos de Inteligencia Artificial",
    },
  });

  const [{ data: academic }, { data: evaluationPage }, { data: rubric }] = await Promise.all([
    db.from("event_academic_contexts").select("subject_name, degree").eq("event_id", created.id).single(),
    db.from("evaluation_pages").select("status, current_round").eq("event_id", created.id).single(),
    db.from("rubrics").select("id").eq("event_id", created.id).eq("is_active", true).single(),
  ]);
  expect(academic).toMatchObject({
    subject_name: "Proyectos de Inteligencia Artificial",
    degree: "Grado en Ingeniería Informática",
  });
  expect(evaluationPage).toMatchObject({ status: "draft", current_round: 1 });
  expect(rubric?.id).toBeTruthy();

  const { data: challenge, error: challengeError } = await db
    .from("challenges")
    .insert({ event_id: created.id, name: "Proyecto de clase", order: 1 })
    .select("id")
    .single();
  if (challengeError) throw challengeError;
  const { data: classTeam, error: teamError } = await db
    .from("teams")
    .insert({ event_id: created.id, challenge_id: challenge.id, name: "Grupo de prueba", number: 1 })
    .select("id")
    .single();
  if (teamError) throw teamError;

  const studentPage = await register(browser, people.student);
  await studentPage.getByLabel("Código del espacio").fill(code);
  await studentPage.getByLabel("Participaré como").selectOption("judge");
  await studentPage.getByRole("button", { name: "Entrar al espacio" }).click();
  await expect(studentPage.getByText(/perfil no está habilitado/)).toBeVisible();

  await studentPage.getByLabel("Código del espacio").fill(code);
  await studentPage.getByLabel("Participaré como").selectOption("student");
  await studentPage.getByRole("button", { name: "Entrar al espacio" }).click();
  await studentPage.waitForURL("**/equipos");
  await expect(studentPage.getByText("Estudiante", { exact: true }).first()).toBeVisible();
  await expect(studentPage.getByRole("link", { name: "Grupo de prueba" })).toBeVisible();

  await studentPage.goto(`/equipos/${classTeam.id}/evaluar`);
  await expect(studentPage.getByText(/perfil de estudiante/)).toBeVisible();
  await expect(studentPage.getByText(/no votar/)).toBeVisible();
  await studentPage.goto("/admin");
  await expect(studentPage).toHaveURL(/\/equipos/);
});

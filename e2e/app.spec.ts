import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";

// Recorre la app como lo harán el jurado, los mentores y el admin, contra la
// base de datos real. Crea usuarios de prueba (correo @test.local) y los borra
// al terminar junto con sus notas y evaluaciones.

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
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
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
};
const privateText = `Nota privada ${stamp}`;
const sharedText = `Nota compartida ${stamp}`;
const liveText = `Nota en directo ${stamp}`;
const createdUserIds = new Set<string>();

let accessCode = "";
let team: { id: string; name: string };
let secondTeam: { id: string; name: string };
let criteriaCount = 0;
let judgePage: Page;
let mentorPage: Page;
let adminPage: Page;

async function login(
  browser: Browser,
  who: { name: string; email: string },
  code: string,
  role: "Juez" | "Mentor" = "Juez",
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Nombre completo").fill(who.name);
  await page.getByLabel("Correo electrónico").fill(who.email);
  await page.getByText(role, { exact: true }).click();
  await page.getByLabel("Código de acceso").fill(code);
  await page.getByRole("button", { name: "Enviarme el código" }).click();
  await expect(page.getByLabel("Código recibido por correo")).toBeVisible();
  // En vez de leer el correo, pedimos a Supabase un código válido para esa cuenta.
  const { data, error } = await db.auth.admin.generateLink({
    type: "magiclink",
    email: who.email,
  });
  if (error) throw error;
  createdUserIds.add(data.user.id);
  await page
    .getByLabel("Código recibido por correo")
    .fill(data.properties.email_otp);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/equipos");
  return page;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  if (process.env.E2E_BASE_URL?.startsWith("http://localhost")) {
    // Las ejecuciones locales comparten la IP loopback. Se limpian únicamente
    // sus contadores para que una ejecución anterior no bloquee la siguiente.
    await db
      .from("auth_attempts")
      .delete()
      .in("key", ["ip:::1", "ip:127.0.0.1", "ip:desconocida"]);
  }

  const { data: event } = await db
    .from("events")
    .select("signup_code, status")
    .single();
  accessCode = event!.signup_code;
  expect(event!.status, "el evento no debe estar cerrado para probar").not.toBe(
    "closed",
  );

  const { data: teams } = await db
    .from("teams")
    .select("id, name")
    .order("number")
    .limit(2);
  [team, secondTeam] = teams as { id: string; name: string }[];

  const { data: rubric } = await db
    .from("rubrics")
    .select("rubric_criteria(id, deleted_at)")
    .eq("is_active", true)
    .single();
  criteriaCount = (
    rubric!.rubric_criteria as { deleted_at: string | null }[]
  ).filter((c) => !c.deleted_at).length;
});

test.afterAll(async () => {
  for (const userId of createdUserIds) {
    await db.from("notes").delete().eq("author_id", userId);
    await db.from("audit_log").delete().eq("user_id", userId);
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error)
      console.warn(
        `No se pudo borrar el usuario E2E ${userId}: ${error.message}`,
      );
  }
});

test("1. Portada y acceso sin contraseña", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Panel del jurado/ }),
  ).toBeVisible();
  await expect(page.getByText("Next.js")).toHaveCount(0);
  await page.getByRole("link", { name: "Entrar" }).click();
  await expect(page.getByLabel("Código de acceso")).toBeVisible();
  await expect(page.getByLabel(/contraseña/i)).toHaveCount(0);
  await expect(
    page.getByAltText(/Ajuntament de València/).first(),
  ).toBeVisible();
});

test("2. Un código incorrecto no deja entrar", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Nombre completo").fill("Intruso");
  await page
    .getByLabel("Correo electrónico")
    .fill(`e2e-intruso-${stamp}@test.local`);
  await page.getByLabel("Código de acceso").fill("CODIGO-FALSO");
  await page.getByRole("button", { name: "Enviarme el código" }).click();
  await expect(page.getByText("Código incorrecto.").first()).toBeVisible();
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
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("4. El juez entra y ve los equipos", async ({ browser }) => {
  judgePage = await login(browser, people.judge, accessCode, "Juez");
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
  await expect(judgePage.getByRole("link", { name: "Admin" })).toHaveCount(0);
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
  mentorPage = await login(browser, people.mentor, accessCode, "Mentor");
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
    mentorPage.getByText(/Como mentor puedes consultar la rúbrica/),
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
    judgePage.getByText("Puntúa todos los criterios antes de enviar."),
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

test("10. El admin entra con su código y ve lo privado", async ({
  browser,
}) => {
  adminPage = await login(browser, people.admin, env.ADMIN_ACCESS_CODE);
  await expect(
    adminPage.getByText("Administrador", { exact: true }).first(),
  ).toBeVisible();

  await adminPage.goto(`/equipos/${team.id}`);
  await expect(adminPage.getByText(privateText)).toBeVisible();
  await expect(adminPage.getByText(sharedText)).toBeVisible();
  await expect(adminPage.getByText("Editar equipo (admin)")).toBeVisible();
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

  await adminPage.goto("/admin");
  await expect(
    adminPage.getByRole("heading", { name: "Evento" }),
  ).toBeVisible();
  await expect(adminPage.getByText(people.judge.name)).toBeVisible();
  await expect(adminPage.getByText(people.mentor.name)).toBeVisible();

  await adminPage.goto("/admin/equipos");
  await expect(
    adminPage.getByRole("heading", { name: "Importar equipos" }),
  ).toBeVisible();
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

test("14. Volver a entrar recupera las notas (mismo correo)", async ({
  browser,
}) => {
  const again = await login(browser, people.judge, accessCode, "Mentor");
  // Conserva su rol de juez aunque marque mentor
  await expect(again.getByText("Juez", { exact: true }).first()).toBeVisible();
  await again.goto(`/equipos/${team.id}`);
  await expect(again.getByText(privateText)).toBeVisible();
});

test("15. Instalable como app (PWA)", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  expect((await manifest.json()).icons.length).toBeGreaterThan(0);
  expect((await request.get("/sw.js")).status()).toBe(200);
  expect((await request.get("/offline.html")).status()).toBe(200);
});

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { loadTestEnv } from "../scripts/load-test-env.mjs";

// Recuperar contraseña, códigos por rol, voto del público (favorito y rúbrica),
// asistente que cambia ajustes y permisos de las tablas nuevas. Usuarios
// @test.local y un espacio temporal que se borran al terminar. No envía correos
// reales: el enlace de recuperación se genera aquí igual que el del correo.

const env = loadTestEnv();
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const stamp = Date.now();
const password = `Novedades-${stamp}!`;
const slug = `novedades-${stamp}`;
const people = {
  owner: `nov-owner-${stamp}@test.local`,
  person: `nov-person-${stamp}@test.local`,
  reset: `nov-reset-${stamp}@test.local`,
};
const ids: Record<string, string> = {};
let eventId = "";
let ownerPage: Page;

test.describe.configure({ mode: "serial" });

function cookieDomain() {
  return new URL(test.info().project.use.baseURL ?? "https://polievalua.tech").hostname;
}

async function createUser(email: string) {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: email.split("@")[0], tour_seen: { admin: true, judge: true, student: true, viewer: true } },
  });
  if (error) throw error;
  await db.from("profiles").update({ disabled: false }).eq("id", data.user.id);
  return data.user.id;
}

async function login(browser: Browser, email: string, pass = password) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(pass);
  await page.getByRole("button", { name: "Entrar en la plataforma" }).click();
  await page.waitForURL("**/espacios");
  return page;
}

async function joinWith(page: Page, code: string) {
  await page.goto("/espacios");
  const form = page.locator("form", { has: page.locator("#join-code") });
  await form.locator("#join-code").fill(code);
  await form.getByRole("button", { name: "Entrar al espacio" }).click();
}

const memberRole = async (userId: string) =>
  (await db.from("event_members").select("role").eq("event_id", eventId).eq("user_id", userId).maybeSingle()).data?.role ?? null;
const codeOf = async (role: string) =>
  (await db.from("event_join_codes").select("code").eq("event_id", eventId).eq("role", role).maybeSingle()).data?.code ?? null;

test.beforeAll(async ({ browser }) => {
  for (const [key, email] of Object.entries(people)) ids[key] = await createUser(email);
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await anon.auth.signInWithPassword({ email: people.owner, password });
  const { data, error } = await anon.rpc("create_event_space", {
    p_name: `Novedades ${stamp}`,
    p_slug: slug,
    p_kind: "hackathon",
    p_signup_code: `NOV${stamp}`,
    p_description: "",
    p_settings: { enabled_roles: ["judge", "mentor", "student", "viewer"] },
  });
  if (error) throw error;
  eventId = data as string;
  ownerPage = await login(browser, people.owner);
  await ownerPage.context().addCookies([{ name: "active_event_id", value: eventId, domain: cookieDomain(), path: "/" }]);
});

test.afterAll(async () => {
  if (eventId) await db.from("events").delete().eq("id", eventId);
  for (const id of Object.values(ids)) {
    await db.from("audit_log").delete().eq("user_id", id);
    await db.auth.admin.deleteUser(id);
  }
});

test("1. Inicio de sesión: enlace para recuperar la contraseña", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Entrar en PoliEvalúa", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "¿Has olvidado la contraseña?" }).click();
  await page.waitForURL("**/recuperar");
});

test("2. Recuperar la contraseña de principio a fin", async ({ page }) => {
  // El límite (3 peticiones cada 30 min por conexión) cuenta también las ejecuciones
  // anteriores de esta prueba: se limpian solo los contadores de esta conexión.
  const { data: ip } = await page.request.get("https://api.ipify.org?format=json").then((r) => r.json()).catch(() => ({ data: null })).then((body) => ({ data: (body as { ip?: string } | null)?.ip ?? null }));
  await db.from("auth_attempts").delete().eq("kind", "password_reset").in("key", ["reset:ip:127.0.0.1", "reset:ip:::ffff:127.0.0.1", "reset:ip:::1", "reset:ip:desconocida", ...(ip ? [`reset:ip:${ip}`] : [])]);
  await page.goto("/recuperar");
  await page.getByLabel("Correo electrónico").fill(people.reset);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByRole("status")).toContainText("te llegará un enlace");
  // Para un correo que no existe la respuesta es la misma (no se revela quién tiene cuenta).
  await page.goto("/recuperar");
  await page.getByLabel("Correo electrónico").fill(`no-existe-${stamp}@test.local`);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByRole("status")).toContainText("te llegará un enlace");

  const { data } = await db.auth.admin.generateLink({ type: "recovery", email: people.reset });
  await page.goto(`/auth/confirm?token_hash=${data.properties!.hashed_token}&type=recovery&next=/nueva-contrasena`);
  await page.waitForURL("**/nueva-contrasena");
  await page.getByLabel("Nueva contraseña").fill(`Nueva-${stamp}!`);
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await page.waitForURL("**/espacios");
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(people.reset);
  await page.getByLabel("Contraseña").fill(`Nueva-${stamp}!`);
  await page.getByRole("button", { name: "Entrar en la plataforma" }).click();
  await page.waitForURL("**/espacios");
  // Un enlace inventado no abre sesión.
  await page.goto("/auth/confirm?token_hash=falso&type=recovery&next=/nueva-contrasena");
  await page.waitForURL("**/recuperar?error=enlace");
  await db.from("auth_attempts").delete().like("key", `reset:%${stamp}%`);
});

test("3. Personas: activar códigos por rol, cada uno distinto", async () => {
  await ownerPage.goto("/admin/personas");
  await expect(ownerPage.getByRole("heading", { name: "Códigos de acceso por rol" })).toBeVisible();
  for (let i = 0; i < 4; i++) {
    const enable = ownerPage.getByRole("button", { name: "Activar código" }).first();
    if (!(await enable.count())) break;
    await enable.click();
    await expect(ownerPage.getByRole("button", { name: "Activar código" })).toHaveCount(3 - i, { timeout: 15_000 });
  }
  const { data } = await db.from("event_join_codes").select("role, code").eq("event_id", eventId);
  expect((data ?? []).map((row) => row.role).sort()).toEqual(["judge", "mentor", "student", "viewer"]);
  expect(new Set((data ?? []).map((row) => row.code)).size).toBe(4);
  for (const row of data ?? []) await expect(ownerPage.getByText(row.code)).toBeVisible();
});

test("4. El código decide el rol y da permisos a quien ya estaba", async ({ browser }) => {
  const page = await login(browser, people.person);
  await expect(page.getByLabel("Participaré como")).toHaveCount(0);
  await joinWith(page, (await codeOf("student"))!.toLowerCase());
  await page.waitForURL("**/equipos");
  expect(await memberRole(ids.person)).toBe("student");
  // Ya está como participante: el código de jurado le da el rol de jurado.
  await joinWith(page, (await codeOf("judge"))!);
  await page.waitForURL("**/equipos");
  expect(await memberRole(ids.person)).toBe("judge");
  // Un código deducido de otro rol no sirve.
  await joinWith(page, (await codeOf("judge"))!.replace("JURADO", "MENTOR"));
  await expect(page.getByText("El código no es válido o el acceso está cerrado.")).toBeVisible();
  expect(await memberRole(ids.person)).toBe("judge");
  // Al propietario no le baja de rol un código.
  await joinWith(ownerPage, (await codeOf("viewer"))!);
  await ownerPage.waitForURL("**/equipos");
  expect(await memberRole(ids.owner)).toBe("owner");
  await page.context().close();
});

test("5. Renovar un código invalida el anterior y desactivar lo quita", async ({ browser }) => {
  const old = (await codeOf("mentor"))!;
  await ownerPage.goto("/admin/personas");
  const row = ownerPage.locator("li", { hasText: old });
  await row.getByRole("button", { name: "Nuevo código" }).click();
  await ownerPage.getByRole("dialog").getByRole("button", { name: "Nuevo código" }).click();
  await expect.poll(() => codeOf("mentor"), { timeout: 15_000 }).not.toBe(old);

  const page = await login(browser, people.reset, `Nueva-${stamp}!`);
  await joinWith(page, old);
  await expect(page.getByText("El código no es válido o el acceso está cerrado.")).toBeVisible();

  await ownerPage.goto("/admin/personas");
  await ownerPage.locator("li", { hasText: "Consulta" }).getByRole("button", { name: "Desactivar" }).click();
  await expect.poll(() => codeOf("viewer"), { timeout: 15_000 }).toBeNull();
  await page.context().close();
});

test("6. Nadie sin permisos lee los códigos ni las puntuaciones del público", async () => {
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await anon.auth.signInWithPassword({ email: people.person, password });
  const codes = await anon.from("event_join_codes").select("code").eq("event_id", eventId);
  expect(codes.data?.length ?? 0).toBe(0);
  const scores = await anon.from("public_scores").select("score").eq("event_id", eventId);
  expect(scores.data?.length ?? 0).toBe(0);
  const insert = await anon.from("public_scores").insert({ event_id: eventId, voter_hash: "x".repeat(64), team_id: eventId, criterion_id: eventId, score: 5 });
  expect(insert.error).toBeTruthy();
});

test("7. Voto del público: favorito y con la rúbrica", async ({ browser }) => {
  const { data: rubric } = await db.from("rubrics").select("id, scale_min, scale_max").eq("event_id", eventId).eq("is_active", true).single();
  const { data: criteria } = await db
    .from("rubric_criteria")
    .insert([
      { rubric_id: rubric!.id, event_id: eventId, title: "Impacto", weight: 60, order: 0 },
      { rubric_id: rubric!.id, event_id: eventId, title: "Presentación", weight: 40, order: 1 },
    ])
    .select("id");
  await db.from("rubric_levels").insert(
    criteria!.flatMap(({ id }) =>
      Array.from({ length: rubric!.scale_max - rubric!.scale_min + 1 }, (_, i) => ({ criterion_id: id, score: rubric!.scale_min + i, label: `Nivel ${i + 1}`, descriptor: "-" })),
    ),
  );
  await db.from("teams").insert(["AquaSense", "BiciRuta"].map((name, i) => ({ event_id: eventId, name, number: i + 1 })));

  // Favorito: la organización abre la votación desde la página.
  await ownerPage.goto("/admin/publico");
  await expect(ownerPage.locator('[role="img"] svg')).toHaveCount(1);
  await ownerPage.locator("#mode").selectOption("favorite");
  await ownerPage.locator("#open").click();
  await ownerPage.getByRole("button", { name: /Guardar/ }).first().click();
  await expect.poll(async () => (await db.from("events").select("settings").eq("id", eventId).single()).data?.settings?.public_vote?.open, { timeout: 15_000 }).toBe(true);
  const votes = async () => (await db.from("public_votes").select("team_id").eq("event_id", eventId)).data?.length ?? 0;
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
  await phone.goto(`/votar/${slug}`);
  await phone.getByLabel(/BiciRuta/).check();
  await phone.getByRole("button", { name: "Votar" }).click();
  await expect.poll(votes, { timeout: 20_000 }).toBe(1);
  await expect(phone.getByRole("status")).toContainText("Voto registrado");
  await phone.getByLabel(/AquaSense/).check();
  await phone.getByRole("button", { name: "Cambiar mi voto" }).click();
  await expect.poll(async () => (await db.from("public_votes").select("teams(name)").eq("event_id", eventId)).data?.map((v) => (v as unknown as { teams: { name: string } }).teams.name).join(), { timeout: 20_000 }).toBe("AquaSense");

  // Rúbrica: dos móviles puntúan; nota media ponderada sobre 100.
  await ownerPage.goto("/admin/publico");
  await ownerPage.locator("#mode").selectOption("rubric");
  await ownerPage.getByRole("button", { name: /Guardar/ }).first().click();
  await expect.poll(async () => (await db.from("events").select("settings").eq("id", eventId).single()).data?.settings?.public_vote?.mode, { timeout: 15_000 }).toBe("rubric");
  const score = async (page: Page, team: string, a: number, b: number) => {
    const card = page.locator("details", { hasText: team });
    if ((await card.getAttribute("open")) === null) await card.locator("summary").click();
    await card.locator("fieldset", { hasText: "Impacto" }).getByText(String(a), { exact: true }).click();
    await card.locator("fieldset", { hasText: "Presentación" }).getByText(String(b), { exact: true }).click();
    await card.getByRole("button", { name: /puntuación/ }).click();
    await expect(card.getByRole("status")).toContainText("Puntuación guardada", { timeout: 20_000 });
  };
  await phone.goto(`/votar/${slug}`);
  await score(phone, "AquaSense", 5, 3);
  const phone2 = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
  await phone2.goto(`/votar/${slug}`);
  await score(phone2, "AquaSense", 4, 4);
  await ownerPage.goto("/admin/publico");
  await expect(ownerPage.getByText("77.5/100 · 2")).toBeVisible();
  await phone.context().close();
  await phone2.context().close();
});

test("8. El asistente propone y aplica ajustes del menú", async () => {
  test.setTimeout(240_000);
  await ownerPage.goto("/admin/asistente");
  await ownerPage.locator("textarea").first().fill("Activa las grabaciones de las exposiciones");
  await ownerPage.getByRole("button", { name: "Enviar" }).click();
  const apply = ownerPage.getByRole("button", { name: "Confirmar y aplicar" }).last();
  await apply.waitFor({ timeout: 150_000 });
  await expect(ownerPage.getByText("Activar la grabación de las exposiciones").last()).toBeVisible();
  await apply.click();
  await ownerPage.waitForURL("**/admin", { timeout: 60_000 });
  const { data } = await db.from("events").select("settings").eq("id", eventId).single();
  expect((data!.settings as { recording?: { enabled?: boolean } }).recording?.enabled).toBe(true);
});

test("9. Portada: código abierto, contacto y vídeo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "contacto@polievalua.tech" }).first()).toBeVisible();
  await expect(page.locator('a[href^="https://github.com/cofrian/PoliEvalua"]').first()).toBeVisible();
  const video = page.locator("video source");
  expect(await video.getAttribute("src")).toBe("/showcase/promo.mp4");
  const response = await page.request.get("/showcase/promo.mp4");
  expect(response.status()).toBe(200);
});

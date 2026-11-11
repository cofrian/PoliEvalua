import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { loadTestEnv } from "../scripts/load-test-env.mjs";

// Lo de #72 en el navegador: grupo en varios retos, botones de la sala
// (saltar, volver a exponer, devolver a la cola), lista del orden y botón
// «Vista jurado». Espacio temporal y usuarios @test.local que se borran.

const env = loadTestEnv();
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const stamp = Date.now();
const password = `Agenda-${stamp}!`;
const people = { owner: `age-owner-${stamp}@test.local`, judge: `age-judge-${stamp}@test.local` };
const ids: Record<string, string> = {};
const slot: Record<number, string> = {};
const team: Record<number, string> = {};
let eventId = "";
let ownerPage: Page;
let judgePage: Page;

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

async function login(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar en la plataforma" }).click();
  await page.waitForURL("**/espacios");
  await page.context().addCookies([{ name: "active_event_id", value: eventId, domain: cookieDomain(), path: "/" }]);
  return page;
}

const statusOf = async (n: number) =>
  (await db.from("presentation_slots").select("status").eq("id", slot[n]).single()).data?.status;
const order = async () =>
  ((await db.from("presentation_slots").select("id").eq("event_id", eventId).order("position")).data ?? []).map((s) => s.id);
const queue = (page: Page) => page.locator("section[aria-labelledby='room-queue-title']");
const openSlot = (page: Page, n: number) => page.goto(`/sala?room=Sala%201&slot=${slot[n]}`);

test.beforeAll(async ({ browser }) => {
  for (const [key, email] of Object.entries(people)) ids[key] = await createUser(email);
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await anon.auth.signInWithPassword({ email: people.owner, password });
  const { data, error } = await anon.rpc("create_event_space", {
    p_name: `Agenda ${stamp}`,
    p_slug: `agenda-e2e-${stamp}`,
    p_kind: "hackathon",
    p_signup_code: `AGE${stamp}`,
    p_description: "",
    p_settings: {},
  });
  if (error) throw error;
  eventId = data as string;
  await db.from("event_members").insert({ event_id: eventId, user_id: ids.judge, role: "judge", status: "active" });

  const { data: challenges } = await db
    .from("challenges")
    .insert([{ event_id: eventId, name: `Reto Alfa ${stamp}` }, { event_id: eventId, name: `Reto Beta ${stamp}` }])
    .select("id, name");
  const alfa = challenges!.find((c) => c.name.startsWith("Reto Alfa"))!.id;
  const beta = challenges!.find((c) => c.name.startsWith("Reto Beta"))!.id;
  const { data: teams } = await db
    .from("teams")
    .insert([1, 2, 3].map((n) => ({ event_id: eventId, challenge_id: alfa, name: `Grupo ${n} ${stamp}`, number: n })))
    .select("id, number");
  for (const t of teams!) team[t.number!] = t.id;
  await db.from("team_challenges").insert({ team_id: team[1], challenge_id: beta, event_id: eventId });
  await db.from("team_members").insert([
    { event_id: eventId, team_id: team[1], full_name: "Zoe Prueba", email: `zoe-${stamp}@test.local` },
    { event_id: eventId, team_id: team[1], full_name: "Ana Prueba", email: `ana-${stamp}@test.local` },
    { event_id: eventId, team_id: team[2], full_name: "Luis Prueba", email: null },
  ]);

  const base = Date.now() + 60 * 60_000;
  const { data: slots } = await db
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
  for (const s of slots!) slot[Number(Object.keys(team).find((k) => team[Number(k)] === s.team_id))] = s.id;

  ownerPage = await login(browser, people.owner);
  judgePage = await login(browser, people.judge);
});

test.afterAll(async () => {
  if (eventId) await db.from("events").delete().eq("id", eventId);
  for (const id of Object.values(ids)) {
    await db.from("audit_log").delete().eq("user_id", id);
    await db.auth.admin.deleteUser(id);
  }
});

test("1. Un grupo en varios retos muestra los dos en su ficha", async () => {
  await judgePage.goto(`/equipos/${team[1]}`);
  await expect(judgePage.getByText(`Reto Alfa ${stamp} · Reto Beta ${stamp}`)).toBeVisible();
});

test("2. La sala muestra el orden completo de los grupos", async () => {
  await openSlot(judgePage, 1);
  await expect(judgePage.getByRole("heading", { name: "Orden de la sala" })).toBeVisible();
  const items = queue(judgePage).locator("li");
  await expect(items).toHaveCount(3);
  for (const n of [1, 2, 3]) await expect(items.nth(n - 1)).toContainText(`Grupo ${n} ${stamp}`);
});

test("3. Saltar un grupo y volver a él desde la lista", async () => {
  await openSlot(judgePage, 1);
  await judgePage.getByRole("button", { name: "Saltar" }).click();
  await expect.poll(() => statusOf(1)).toBe("skipped");

  await openSlot(judgePage, 2);
  await queue(judgePage).getByRole("link", { name: new RegExp(`Grupo 1 ${stamp}`) }).click();
  await expect(judgePage).toHaveURL(new RegExp(`slot=${slot[1]}`));
  await judgePage.getByRole("button", { name: "Empezar turno" }).click();
  await expect.poll(() => statusOf(1)).toBe("live");
  await expect(judgePage.getByRole("button", { name: "Terminar" })).toBeVisible();
});

test("4. Volver a exponer y devolver a la cola un grupo terminado", async () => {
  await openSlot(judgePage, 1);
  await judgePage.getByRole("button", { name: "Terminar" }).click();
  await expect.poll(() => statusOf(1)).toBe("done");

  await judgePage.getByRole("button", { name: "Volver a exponer" }).click();
  await expect.poll(() => statusOf(1)).toBe("live");

  await judgePage.getByRole("button", { name: "Terminar" }).click();
  await expect.poll(() => statusOf(1)).toBe("done");
  await judgePage.getByRole("button", { name: "Devolver a la cola" }).click();
  await expect.poll(() => statusOf(1)).toBe("pending");
  await expect(judgePage.getByRole("button", { name: "Empezar turno" })).toBeVisible();
});

test("5. Cambiar el orden con las flechas y con «a continuación»", async () => {
  await openSlot(judgePage, 1);
  await queue(judgePage).getByRole("button", { name: `Bajar a Grupo 1 ${stamp}` }).click();
  await expect.poll(order).toEqual([slot[2], slot[1], slot[3]]);

  await queue(judgePage).getByRole("button", { name: `Subir a Grupo 1 ${stamp}` }).click();
  await expect.poll(order).toEqual([slot[1], slot[2], slot[3]]);

  // Con el grupo 1 seleccionado, el grupo 3 pasa justo detrás.
  await queue(judgePage).getByRole("button", { name: `Poner a Grupo 3 ${stamp} a continuación` }).click();
  await expect.poll(order).toEqual([slot[1], slot[3], slot[2]]);
  await expect(queue(judgePage).locator("li").nth(1)).toContainText(`Grupo 3 ${stamp}`);
});

test("6. El jurado no tiene el botón «Vista jurado»", async () => {
  await judgePage.goto("/equipos");
  await expect(judgePage.getByRole("button", { name: "Vista jurado" })).toHaveCount(0);
});

test("7. La gestión entra y sale de la vista de jurado", async () => {
  await ownerPage.goto("/equipos");
  const adminLinks = ownerPage.locator("a[href^='/admin']");
  await expect(adminLinks.first()).toBeAttached();

  await ownerPage.getByRole("button", { name: "Vista jurado" }).click();
  await expect(ownerPage.getByText("Estás en la vista de jurado")).toBeVisible();
  await expect(adminLinks).toHaveCount(0);
  await expect(ownerPage.getByRole("button", { name: "Volver a gestión" })).toHaveAttribute("aria-pressed", "true");

  // Sigue siendo gestión: puede usar la sala.
  await openSlot(ownerPage, 2);
  await expect(ownerPage.getByRole("heading", { name: "Orden de la sala" })).toBeVisible();

  await ownerPage.getByRole("button", { name: "Volver a gestión" }).click();
  await expect(ownerPage.getByText("Estás en la vista de jurado")).toHaveCount(0);
  await expect(adminLinks.first()).toBeAttached();
});

test("8. La gestión descarga el Excel de grupos con sus integrantes", async () => {
  await ownerPage.goto("/admin/equipos");
  const [download] = await Promise.all([
    ownerPage.waitForEvent("download"),
    ownerPage.getByRole("link", { name: "Descargar Excel" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  // exceljs no carga dentro de Playwright: se lee en un proceso aparte.
  const read = `const E=require("exceljs");const b=new E.Workbook();b.xlsx.readFile(process.argv[1]).then(()=>console.log(JSON.stringify(b.worksheets[0].getSheetValues().slice(1).map(r=>r.slice(1).map(v=>v??"")))))`;
  const rows = JSON.parse(execFileSync("node", ["-e", read, (await download.path())!], { encoding: "utf8" })) as unknown[][];
  expect(rows[0]).toEqual(["Nº", "Equipo", "Retos", "Proyecto", "Integrante", "Correo"]);
  expect(rows.slice(1)).toEqual([
    [1, `Grupo 1 ${stamp}`, `Reto Alfa ${stamp}, Reto Beta ${stamp}`, "", "Ana Prueba", `ana-${stamp}@test.local`],
    [1, `Grupo 1 ${stamp}`, `Reto Alfa ${stamp}, Reto Beta ${stamp}`, "", "Zoe Prueba", `zoe-${stamp}@test.local`],
    [2, `Grupo 2 ${stamp}`, `Reto Alfa ${stamp}`, "", "Luis Prueba", ""],
    [3, `Grupo 3 ${stamp}`, `Reto Alfa ${stamp}`, "", "", ""],
  ]);
});

test("9. El jurado no puede descargar el Excel", async () => {
  const response = await judgePage.request.get("/admin/equipos/excel");
  expect(response.status()).toBe(403);
});

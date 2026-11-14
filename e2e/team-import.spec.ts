import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTestEnv } from "../scripts/load-test-env.mjs";

// Importación de grupos con IA: un Excel desordenado (título, filas vacías,
// integrantes en columnas, «Nombre <correo>») y un CSV con personas sin grupo
// que se reparten por orden alfabético. Espacio y usuaria temporales.

const env = loadTestEnv();
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const stamp = Date.now();
const password = `Prueba-${stamp}!`;
const spaceName = `Carga de grupos E2E ${stamp}`;
const teacher = { name: `Profe Import ${stamp}`, email: `e2e-import-${stamp}@test.local` };
const dir = mkdtempSync(join(tmpdir(), "import-e2e-"));
let userId = "";
let eventId = "";
let page: Page;

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.beforeAll(async ({ browser }) => {
  const { data, error } = await db.auth.admin.createUser({
    email: teacher.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: teacher.name, tour_seen: { admin: true, judge: true, student: true, viewer: true } },
  });
  if (error) throw error;
  userId = data.user.id;
  await db.from("profiles").update({ disabled: false, full_name: teacher.name }).eq("id", userId);

  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await client.auth.signInWithPassword({ email: teacher.email, password });
  const { data: created, error: createError } = await client.rpc("create_event_space", {
    p_name: spaceName,
    p_slug: `importar-e2e-${stamp}`,
    p_kind: "class",
    p_signup_code: `IMP-${stamp}`,
    p_description: "Espacio temporal de pruebas de importación",
    p_settings: {
      participant_mode: "groups",
      evaluation_mode: "feedback",
      enabled_roles: ["teacher", "student"],
      join_roles: ["student"],
      modules: ["participants", "notes"],
    },
  });
  if (createError) throw createError;
  eventId = created as string;

  const context = await browser.newContext();
  page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(teacher.email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar en la plataforma" }).click();
  await page.waitForURL("**/espacios");
  await page.locator("article", { hasText: spaceName }).getByRole("button", { name: "Entrar al espacio" }).click();
  await page.waitForURL(/\/(equipos|admin)/);
});

test.afterAll(async () => {
  await page?.context().close();
  if (eventId) await db.from("events").delete().eq("id", eventId);
  if (userId) {
    await db.from("audit_log").delete().eq("user_id", userId);
    await db.auth.admin.deleteUser(userId);
  }
});

async function openImporter() {
  await page.goto("/admin/equipos");
  await page.getByRole("button", { name: "Importar lista" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Importar con IA")).toBeVisible();
  return dialog;
}

async function members() {
  const { data } = await db
    .from("team_members")
    .select("full_name, email, teams(name)")
    .eq("event_id", eventId);
  return (data ?? []).map((row) => ({
    name: row.full_name,
    email: row.email,
    team: (row.teams as unknown as { name: string } | null)?.name ?? null,
  }));
}

test("1. Excel desordenado: un grupo por fila con integrantes en columnas", async () => {
  // exceljs no carga dentro de Playwright: el Excel se genera con Node aparte.
  const path = join(dir, "grupos.xlsx");
  const script = `
    const ExcelJS = require("exceljs");
    const book = new ExcelJS.Workbook();
    book.addWorksheet("Instrucciones").addRow(["Rellenad un grupo por fila. Fecha límite: viernes."]);
    const sheet = book.addWorksheet("Grupos 2026");
    sheet.addRow(["Proyecto Integrador · Listado de grupos"]);
    sheet.addRow([]);
    sheet.addRow(["Nombre del grupo", "Integrante 1", "Integrante 2", "Integrante 3", "Nº miembros"]);
    sheet.addRow(["Los Bits", "Ana Ruiz <ana.ruiz@test.local>", "Bruno Gil <bruno.gil@test.local>", "", 2]);
    sheet.addRow(["Byte Club", "Carla Sanz <carla.sanz@test.local>", "Dani Mora", "Elena Paz <elena.paz@test.local>", 3]);
    sheet.addRow(["Grupo Vacío", "", "", "", 0]);
    book.xlsx.writeFile(process.argv[1]);`;
  execFileSync(process.execPath, ["-e", script, path], { cwd: process.cwd() });

  const dialog = await openImporter();
  await dialog.getByLabel("Archivo Excel (.xlsx) o CSV").setInputFiles(path);
  await dialog.getByRole("button", { name: "Analizar archivo" }).click();
  await expect(dialog.getByText(/3 grupos · 5 personas/)).toBeVisible({ timeout: 120_000 });
  await expect(dialog.getByText("Dani Mora", { exact: false })).toBeVisible();

  await dialog.getByRole("button", { name: /Guardar 3 grupos y 5 personas/ }).click();
  await expect(dialog.getByText(/3 grupos nuevos · 5 personas añadidas/)).toBeVisible({ timeout: 30_000 });

  const { data: teams } = await db.from("teams").select("name").eq("event_id", eventId);
  expect((teams ?? []).map((t) => t.name).sort()).toEqual(["Byte Club", "Grupo Vacío", "Los Bits"]);
  const saved = await members();
  expect(saved).toHaveLength(5);
  expect(saved).toContainEqual({ name: "Ana Ruiz", email: "ana.ruiz@test.local", team: "Los Bits" });
  expect(saved).toContainEqual({ name: "Dani Mora", email: null, team: "Byte Club" });
});

test("2. CSV con personas sin grupo: se reparten por orden alfabético", async () => {
  const csv = [
    "Apellidos;Nombre;Correo electrónico;Grupo",
    "Ruiz;Ana;ana.ruiz@test.local;Los Bits",
    "Vidal;Fede;fede.vidal@test.local;",
    "Abad;Gema;gema.abad@test.local;",
    "López;Hugo;hugo.lopez@test.local;",
    "Navarro;Irene;irene.navarro@test.local;",
  ].join("\n");
  const path = join(dir, "alumnado.csv");
  writeFileSync(path, csv);

  const dialog = await openImporter();
  await dialog.getByLabel("Archivo Excel (.xlsx) o CSV").setInputFiles(path);
  await dialog.getByRole("button", { name: "Analizar archivo" }).click();
  await expect(dialog.getByText(/4 personas no tienen grupo/i)).toBeVisible({ timeout: 120_000 });

  await dialog.getByLabel("¿Qué hacemos con ellas?").selectOption("alphabetical");
  await dialog.locator("#import-group-size").fill("2");
  await dialog.getByRole("button", { name: /^Guardar/ }).click();
  await expect(dialog.getByText(/2 grupos nuevos · 4 personas añadidas · 1 ya estaban/)).toBeVisible({ timeout: 30_000 });

  const saved = await members();
  expect(saved).toHaveLength(9);
  const team = (name: string) => saved.find((m) => m.name === name)?.team;
  // Orden alfabético por nombre: Fede, Gema | Hugo, Irene.
  expect(team("Fede Vidal")).toBe(team("Gema Abad"));
  expect(team("Hugo López")).toBe(team("Irene Navarro"));
  expect(team("Fede Vidal")).not.toBe(team("Hugo López"));
  expect(team("Fede Vidal")).not.toBe("Los Bits");
});

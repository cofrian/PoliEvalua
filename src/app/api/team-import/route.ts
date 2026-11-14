import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import Papa from "papaparse";

import { generateJson } from "@/lib/ai/generate-json";
import { LOCALE_RULE, type SpaceLocale } from "@/lib/ai/prompts/presentation";
import { aiConfigured, NVIDIA_BASE_URL, withModelFallback } from "@/lib/ai/models";
import { getSession } from "@/lib/app/session";
import {
  applyPlan,
  describeSheets,
  guessPlan,
  importPlanSchema,
  type ImportPlan,
  type Sheet,
} from "@/lib/app/team-import";
import { clientIp, isBlocked, recordAttempt } from "@/lib/auth/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_ROWS = 3000;

async function readSheets(file: File | null, pasted: string): Promise<Sheet[]> {
  if (file && /\.xlsx$/i.test(file.name)) {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await file.arrayBuffer());
    return book.worksheets.map((sheet) => {
      const rows: string[][] = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        if (rows.length >= MAX_ROWS) return;
        const cells: string[] = [];
        // Las celdas combinadas devuelven el valor de la principal en todas.
        for (let col = 1; col <= Math.min(row.cellCount, 200); col += 1) {
          cells.push(row.getCell(col).text?.trim() ?? "");
        }
        rows.push(cells);
      });
      return { name: sheet.name, rows };
    });
  }
  const raw = (file ? await file.text() : pasted).replace(/^﻿/, "").trim();
  if (!raw) return [];
  const firstLine = raw.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";
  const rows = Papa.parse<string[]>(raw, { delimiter, skipEmptyLines: true }).data.slice(0, MAX_ROWS);
  return [{ name: file?.name.replace(/\.[^.]+$/, "") || "Lista", rows: rows.map((row) => row.map((c) => c.trim())) }];
}

const system = (unit: string, units: string, hasChallenges: boolean, locale: SpaceLocale) => `Eres el agente que importa ${units.toLowerCase()} en una plataforma de evaluación de la UPV.
Recibes una muestra de un Excel o CSV sin formato fijo y describes su ESTRUCTURA para que un programa extraiga los datos de todas las filas.
No copies ni reescribas datos: solo indica números de fila y de columna (empiezan en 0, como en la muestra).

Para cada hoja elige layout:
- person_rows: una fila por persona. Puede tener columna de ${unit.toLowerCase()} o no tenerla (personas sin asignar).
- team_rows: una fila por ${unit.toLowerCase()} con los integrantes repartidos en varias columnas (memberColumns). Si los correos van en columnas aparte, ponlas en memberEmailColumns en el mismo orden.
- team_blocks: una fila con el nombre del ${unit.toLowerCase()} y debajo las filas de sus integrantes. teamColumn es la columna donde aparece el nombre del bloque.
- teams_only: solo hay nombres de ${units.toLowerCase()}, sin personas.
- skip: la hoja no contiene ${units.toLowerCase()} ni personas (instrucciones, totales, etc.).

Reglas:
- headerRow es la fila con los títulos; null si no hay títulos.
- Si el nombre completo está en una columna usa nameColumn; si nombre y apellidos van separados usa firstNameColumn y lastNameColumn.
- emailColumn solo si hay una columna de correos (en la muestra aparecen enmascarados como a***@dominio).
- Una columna con números que son la cantidad de miembros NO es numberColumn; numberColumn es el número o identificador del ${unit.toLowerCase()}.
${hasChallenges ? "- challengeColumn es el reto, categoría o track al que pertenece cada equipo, si existe." : "- Este espacio no usa retos: challengeColumn debe ser null."}
- teamFromSheetName true solo si cada hoja corresponde a un ${unit.toLowerCase()} distinto y su nombre es el de la hoja.
- Incluye una entrada en sheets por cada hoja de la muestra.
- ${LOCALE_RULE[locale] ?? LOCALE_RULE.es} Esto aplica a reply y questions.
- reply: una o dos frases explicando qué has entendido (cuántas hojas, si hay personas, si tienen correo, si hay ${units.toLowerCase()}).
- Si algo es ambiguo, haz tu mejor interpretación y pregunta en questions (máximo 3). Si está claro, questions vacío.`;

export async function POST(request: Request) {
  const startedAt = Date.now();
  const t = await getTranslations("teamImport.errors");
  const session = await getSession();
  if (!session.isAdmin) return NextResponse.json({ error: t("onlyAdmin") }, { status: 403 });
  const { supabase, event, words } = session;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const upload = file instanceof File && file.size ? file : null;
  const pasted = typeof form?.get("content") === "string" ? String(form?.get("content")) : "";
  const hint = typeof form?.get("hint") === "string" ? String(form?.get("hint")).trim().slice(0, 1000) : "";

  if (upload && upload.size > MAX_BYTES) {
    return NextResponse.json({ error: t("tooBig") }, { status: 413 });
  }
  if (upload && /\.xls$/i.test(upload.name)) {
    return NextResponse.json(
      { error: t("oldXls") },
      { status: 400 },
    );
  }

  let sheets: Sheet[];
  try {
    sheets = (await readSheets(upload, pasted)).filter((sheet) => sheet.rows.length);
  } catch {
    return NextResponse.json({ error: t("unreadable") }, { status: 400 });
  }
  if (!sheets.length) return NextResponse.json({ error: t("empty") }, { status: 400 });

  const { count: challengeCount } = await supabase
    .from("challenges")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id);
  const hasChallenges = Boolean(challengeCount) || event.kind === "hackathon";

  let plan: ImportPlan = guessPlan(sheets);
  let usedAi = false;
  let notice: string | null = null;

  const admin = createAdminClient();
  const rateKeys = [`assistant:user:${session.user.id}`, `assistant:ip:${await clientIp()}`];
  if (!aiConfigured()) {
    notice = t("noAi");
  } else if (await isBlocked(admin, "assistant", rateKeys)) {
    notice = t("rateLimit");
  } else {
    await recordAttempt(admin, "assistant", rateKeys);
    const provider = createOpenAICompatible({
      name: "nvidia",
      baseURL: NVIDIA_BASE_URL,
      apiKey: process.env.NVIDIA_API_KEY,
      supportsStructuredOutputs: false,
    });
    try {
      const { result } = await withModelFallback(
        "builder",
        (modelId, abortSignal) =>
          generateJson({
            provider,
            modelId,
            schema: importPlanSchema,
            system: system(words.unit, words.units, hasChallenges, session.locale as SpaceLocale),
            prompt: `${describeSheets(sheets)}${hint ? `\n\nIndicaciones de quien organiza (tienen prioridad): ${hint}` : ""}`,
            abortSignal,
            maxOutputTokens: 3000,
          }),
        { deadlineMs: startedAt + 100_000, attemptTimeoutMs: 45_000 },
      );
      plan = { ...result, sheets: result.sheets.filter((entry) => entry.sheet < sheets.length) };
      if (!hasChallenges) plan.sheets = plan.sheets.map((entry) => ({ ...entry, challengeColumn: null }));
      usedAi = true;
    } catch (error) {
      console.error("Importación de equipos: la IA ha fallado:", error instanceof Error ? error.message : error);
      notice = t("aiFailed");
    }
  }

  let result = applyPlan(sheets, plan);
  // Si la IA no saca nada pero los títulos sí, mejor eso que nada.
  if (usedAi && !result.teams.length && !result.people.length) {
    const fallback = applyPlan(sheets, guessPlan(sheets));
    if (fallback.teams.length || fallback.people.length) {
      result = fallback;
      notice = t("aiEmpty");
    }
  }

  return NextResponse.json({
    ...result,
    reply: plan.reply,
    questions: plan.questions,
    notice,
    usedAi,
    sheets: sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows.length })),
  });
}

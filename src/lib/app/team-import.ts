import { z } from "zod";

// Importación de equipos desde hojas sin formato fijo. El agente de IA solo
// describe la estructura (qué columna es qué y cómo se agrupan las filas); los
// datos los extrae este código fila a fila, así no se inventa ni cambia
// ningún nombre o correo y funciona igual con 10 que con 1000 filas.

export type Sheet = { name: string; rows: string[][] };

const column = z.number().int().min(0).max(199).nullable();

export const sheetPlanSchema = z.object({
  /** Posición de la hoja (0 = la primera). */
  sheet: z.number().int().min(0).max(49),
  /**
   * person_rows: una fila por persona (con columna de equipo o sin ella).
   * team_rows: una fila por equipo con los integrantes en varias columnas.
   * team_blocks: una fila con el nombre del equipo y debajo sus integrantes.
   * teams_only: solo nombres de equipos, sin personas.
   * skip: la hoja no tiene equipos ni personas.
   */
  layout: z.enum(["person_rows", "team_rows", "team_blocks", "teams_only", "skip"]),
  /** Fila con los títulos de las columnas; los datos empiezan en la siguiente. */
  headerRow: z.number().int().min(0).nullable(),
  teamColumn: column,
  challengeColumn: column,
  numberColumn: column,
  nameColumn: column,
  firstNameColumn: column,
  lastNameColumn: column,
  emailColumn: column,
  /** team_rows: columnas con integrantes (nombre, correo o «Nombre <correo>»). */
  memberColumns: z.array(z.number().int().min(0).max(199)).max(80),
  /** team_rows: correos de los integrantes, en el mismo orden que memberColumns. */
  memberEmailColumns: z.array(z.number().int().min(0).max(199)).max(80),
  /** Cada hoja es un equipo y su nombre es el de la hoja. */
  teamFromSheetName: z.boolean(),
});

export type SheetPlan = z.infer<typeof sheetPlanSchema>;

export const importPlanSchema = z.object({
  sheets: z.array(sheetPlanSchema).max(50),
  /** Resumen breve para quien organiza: qué ha entendido del archivo. */
  reply: z.string().trim().min(2).max(800),
  /** Dudas que impiden interpretarlo bien (máximo 3). */
  questions: z.array(z.string().trim().min(3).max(300)).max(3),
});

export type ImportPlan = z.infer<typeof importPlanSchema>;

export type ImportedTeam = { name: string; challenge: string | null; number: number | null };
export type ImportedPerson = { fullName: string; email: string | null; team: string | null };
export type ImportResult = { teams: ImportedTeam[]; people: ImportedPerson[] };

const EMAIL = /[^@\s<>()[\],;:"']+@[^@\s<>()[\],;:"']+\.[a-z]{2,}/i;
export const VALID_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const clean = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

/** «Ana García <ana@upv.es>», «ana@upv.es» o «Ana García» → nombre y correo. */
export function splitNameEmail(raw: string): { fullName: string; email: string | null } {
  const cell = clean(raw);
  const email = cell.match(EMAIL)?.[0]?.toLowerCase() ?? null;
  let fullName = email ? clean(cell.replace(EMAIL, "").replace(/[<>()[\]]/g, " ").replace(/^[-–:,;]+|[-–:,;]+$/g, "")) : cell;
  if (!fullName && email) fullName = email.split("@")[0];
  return { fullName, email };
}

/** Una celda puede traer varios integrantes: por líneas, «;» o comas entre correos. */
function splitMembers(raw: string) {
  const parts = raw.split(/\r?\n|;|\s\/\s|\s\|\s/);
  return parts.flatMap((part) => ((part.match(/@/g) ?? []).length > 1 ? part.split(",") : [part])).map(clean).filter(Boolean);
}

const isNumberCell = (value: string) => /^\d+([.,]0+)?$/.test(value);

function cell(row: string[], index: number | null) {
  return index === null ? "" : clean(row[index]);
}

function personFrom(row: string[], plan: SheetPlan): { fullName: string; email: string | null } | null {
  const explicitEmail = cell(row, plan.emailColumn).toLowerCase();
  const first = cell(row, plan.firstNameColumn) || cell(row, plan.nameColumn);
  const last = plan.lastNameColumn === plan.nameColumn ? "" : cell(row, plan.lastNameColumn);
  // Nombre y apellidos en columnas separadas se juntan en orden natural.
  const fullName = [first, last].filter(Boolean).join(" ");
  const fromName = splitNameEmail(fullName);
  const email = explicitEmail.match(EMAIL)?.[0]?.toLowerCase() ?? fromName.email;
  const name = fromName.fullName || (email ? email.split("@")[0] : "");
  return name ? { fullName: name, email } : null;
}

/** Aplica el plan del agente a todas las filas de todas las hojas. */
export function applyPlan(sheets: Sheet[], plan: ImportPlan): ImportResult {
  const teams = new Map<string, ImportedTeam>();
  const people: ImportedPerson[] = [];
  const seenEmail = new Set<string>();
  const seenName = new Set<string>();

  const addTeam = (name: string, challenge: string | null = null, number: number | null = null) => {
    const key = name.toLowerCase();
    const current = teams.get(key);
    if (current) {
      current.challenge ??= challenge;
      current.number ??= number;
      return current.name;
    }
    teams.set(key, { name, challenge, number });
    return name;
  };
  const addPerson = (fullName: string, email: string | null, team: string | null) => {
    if (email) {
      if (seenEmail.has(email)) return;
      seenEmail.add(email);
    } else {
      const key = `${fullName.toLowerCase()}|${team?.toLowerCase() ?? ""}`;
      if (seenName.has(key)) return;
      seenName.add(key);
    }
    people.push({ fullName: fullName.slice(0, 160), email, team });
  };

  for (const rawPlan of plan.sheets) {
    const sheet = sheets[rawPlan.sheet];
    if (!sheet || rawPlan.layout === "skip") continue;
    const sheetPlan = fixPlan(sheet, rawPlan);
    const rows = sheet.rows.slice(sheetPlan.headerRow === null ? 0 : sheetPlan.headerRow + 1);
    const sheetTeam = sheetPlan.teamFromSheetName ? clean(sheet.name) : null;
    const meta = (row: string[]) => {
      const number = cell(row, sheetPlan.numberColumn);
      return {
        challenge: cell(row, sheetPlan.challengeColumn) || null,
        number: isNumberCell(number) ? Number.parseInt(number, 10) : null,
      };
    };
    let currentTeam: string | null = sheetTeam;

    for (const row of rows) {
      if (!row.some((value) => clean(value)) || isTitleRow(row)) continue;
      const teamCell = cell(row, sheetPlan.teamColumn);
      const { challenge, number } = meta(row);

      if (sheetPlan.layout === "teams_only") {
        const name = teamCell || (sheetPlan.teamColumn === null ? clean(row.find((value) => clean(value))) : "");
        // Una celda con correo es una persona, nunca el nombre de un grupo.
        if (name && !EMAIL.test(name)) addTeam(name.slice(0, 120), challenge, number);
        continue;
      }

      if (sheetPlan.layout === "team_rows") {
        const name = teamCell || sheetTeam;
        if (!name) continue;
        const team = addTeam(name.slice(0, 120), challenge, number);
        sheetPlan.memberColumns.forEach((index, position) => {
          const emailColumn = sheetPlan.memberEmailColumns[position];
          const pairedEmail = emailColumn === undefined ? "" : cell(row, emailColumn).toLowerCase();
          for (const member of splitMembers(row[index] ?? "")) {
            if (isNumberCell(member)) continue; // nº de miembros u otras cuentas
            const { fullName, email } = splitNameEmail(member);
            const finalEmail = email ?? (pairedEmail.match(EMAIL)?.[0] ?? null);
            if (fullName) addPerson(fullName, finalEmail, team);
          }
        });
        continue;
      }

      const person = personFrom(row, sheetPlan);
      if (sheetPlan.layout === "team_blocks") {
        // Fila de cabecera de bloque: trae equipo pero no persona (o solo una celda con texto).
        const filled = row.map(clean).filter(Boolean);
        const looksLikeHeader = (teamCell && !person) || (!person?.email && filled.length === 1 && !cell(row, sheetPlan.emailColumn));
        if (looksLikeHeader) {
          const name = teamCell || filled[0];
          currentTeam = addTeam(name.slice(0, 120), challenge, number);
          continue;
        }
        if (person) addPerson(person.fullName, person.email, currentTeam);
        continue;
      }

      // person_rows
      const teamName = teamCell || sheetTeam;
      const team = teamName ? addTeam(teamName.slice(0, 120), challenge, number) : null;
      if (person) addPerson(person.fullName, person.email, team);
    }
  }

  return { teams: [...teams.values()], people };
}

/** Fila de títulos (p. ej. repetida al pie de cada página o mal señalada). */
function isTitleRow(row: string[]) {
  const filled = row.map(clean).filter(Boolean);
  const titles = filled.filter((value) => Object.values(hints).some((hint) => hint.test(value)));
  return filled.length > 1 && titles.length >= Math.ceil(filled.length / 2);
}

const LIST_TITLE = /^(listado de |lista de |nombres? de (los )?)?(equipos?|grupos?|grups?|teams?|groups?|proyectos?|participantes)\b/i;
const COUNT_HEADER = /(miembros|members|integrantes|personas|total|count|membres)/i;

/**
 * Corrige lo que el modelo suele fallar en la posición de las filas: si la
 * fila de títulos que indica no lo es pero una cercana sí, usa esa; y una
 * columna «Nº miembros» nunca es el número del grupo.
 */
function fixPlan(sheet: Sheet, plan: SheetPlan): SheetPlan {
  let headerRow = plan.headerRow;
  const isHeader = (index: number) => index >= 0 && index < sheet.rows.length && isTitleRow(sheet.rows[index]);
  if (headerRow === null || !isHeader(headerRow)) {
    const start = headerRow ?? 0;
    const found = [start, start + 1, start + 2, start + 3, start - 1].find(isHeader);
    if (found !== undefined) headerRow = found;
  }
  // Lista de una columna con un título como «Equipos inscritos» o «Grupos 2026».
  if (headerRow === null && plan.layout === "teams_only") {
    const first = sheet.rows.findIndex((row) => row.some((value) => clean(value)));
    const cells = first >= 0 ? sheet.rows[first].map(clean).filter(Boolean) : [];
    if (cells.length === 1 && LIST_TITLE.test(cells[0])) headerRow = first;
  }
  const header = headerRow === null ? [] : sheet.rows[headerRow] ?? [];
  const numberHeader = plan.numberColumn === null ? "" : clean(header[plan.numberColumn]);
  return {
    ...plan,
    headerRow,
    numberColumn: numberHeader && COUNT_HEADER.test(numberHeader) ? null : plan.numberColumn,
  };
}

const hints = {
  team: /^(equipo|grupo|team|group|grup|nombre (del )?(equipo|grupo)|proyecto)$/i,
  challenge: /^(reto|challenge|repte|track|categor[ií]a)$/i,
  number: /^(n[ºo°.]?|n[uú]m(ero)?|#|id)$/i,
  name: /^(nombre completo|full ?name|alumno|alumna|estudiante|student|participante|integrante|nom i cognoms|nombre y apellidos)$/i,
  firstName: /^(nombre|name|first ?name|nom)$/i,
  lastName: /^(apellidos?|surname|last ?name|cognoms)$/i,
  email: /^(e-?mail|correo|correo electr[oó]nico|mail|correu)$/i,
  member: /^(miembro|integrante|member|participante|alumno|estudiante)\s*\d+$/i,
};

/**
 * Plan sin IA (por si no está configurada, falla o lee peor que esto): busca
 * la fila de títulos en las primeras filas y reconoce los bloques «nombre del
 * grupo + integrantes debajo». Cubre los casos habituales.
 */
export function guessPlan(sheets: Sheet[]): ImportPlan {
  const plans: SheetPlan[] = sheets.map((sheet, index) => {
    const anyHint = (row: string[]) => row.map(clean).some((value) => Object.values(hints).some((hint) => hint.test(value)));
    let headerRow: number | null = sheet.rows.slice(0, 6).findIndex(isTitleRow);
    if (headerRow < 0) headerRow = sheet.rows[0] && anyHint(sheet.rows[0]) ? 0 : null;
    const header = headerRow === null ? [] : sheet.rows[headerRow].map(clean);
    const find = (hint: RegExp) => {
      const found = header.findIndex((value) => hint.test(value));
      return found >= 0 ? found : null;
    };
    const memberColumns = header.flatMap((value, i) => (hints.member.test(value) ? [i] : []));
    const columns = {
      teamColumn: find(hints.team),
      challengeColumn: find(hints.challenge),
      numberColumn: find(hints.number),
      nameColumn: find(hints.name),
      firstNameColumn: find(hints.firstName),
      lastNameColumn: find(hints.lastName),
      emailColumn: find(hints.email),
    };
    const data = sheet.rows.slice(headerRow === null ? 0 : headerRow + 1);
    let emailColumn = columns.emailColumn;
    if (emailColumn === null) {
      const sample = data.slice(0, 40);
      const width = Math.max(0, ...sample.map((row) => row.length));
      for (let i = 0; i < width && emailColumn === null; i += 1) {
        if (sample.some((row) => EMAIL.test(row[i] ?? ""))) emailColumn = i;
      }
    }
    const base = {
      sheet: index,
      headerRow,
      ...columns,
      emailColumn,
      memberColumns,
      memberEmailColumns: [],
      teamFromSheetName: false,
    };

    // Bloques: filas con una sola celda (sin correo) seguidas de filas con personas.
    const filled = (row: string[]) => row.map(clean).filter(Boolean);
    const blockHeads = data.filter((row, i) => {
      const cells = filled(row);
      const next = data.slice(i + 1).find((other) => filled(other).length);
      return cells.length === 1 && !EMAIL.test(cells[0]) && next !== undefined && next.some((value) => EMAIL.test(value));
    }).length;
    const personRows = data.filter((row) => row.some((value) => EMAIL.test(value))).length;
    if (!memberColumns.length && columns.teamColumn === null && blockHeads >= 1 && personRows > blockHeads) {
      const nameColumn = emailColumn === 0 ? null : 0;
      return { ...base, layout: "team_blocks", teamColumn: 0, nameColumn: columns.nameColumn ?? nameColumn };
    }

    const hasPerson = columns.nameColumn !== null || columns.firstNameColumn !== null || emailColumn !== null;
    if (memberColumns.length) return { ...base, layout: "team_rows" };
    if (hasPerson) {
      return {
        ...base,
        layout: "person_rows",
        nameColumn: columns.nameColumn ?? (headerRow === null && emailColumn !== null && emailColumn > 0 ? 0 : null),
      };
    }
    if (!data.length) return { ...base, layout: "skip" };
    // Solo grupos: una columna, con o sin título tipo «Equipos inscritos».
    const firstCells = sheet.rows[0] ? filled(sheet.rows[0]) : [];
    const titled = headerRow === null && firstCells.length === 1 && LIST_TITLE.test(firstCells[0]);
    return { ...base, layout: "teams_only", headerRow: titled ? 0 : headerRow, teamColumn: columns.teamColumn ?? 0 };
  });
  return { sheets: plans, reply: "", questions: [] };
}

/** Cuántos correos distintos recoge una lectura: sirve para elegir la mejor. */
export function emailCoverage(result: ImportResult) {
  return result.people.filter((person) => person.email).length;
}

const COLUMN_KEYS = [
  "teamColumn",
  "challengeColumn",
  "numberColumn",
  "nameColumn",
  "firstNameColumn",
  "lastNameColumn",
  "emailColumn",
] as const;

/**
 * Completa el plan del modelo con lo que dicen los títulos: si deja vacía una
 * columna que tiene un título inequívoco (p. ej. «Grupo»), se usa esa.
 */
export function completePlan(sheets: Sheet[], plan: ImportPlan, allowChallenges = true): ImportPlan {
  const guessed = guessPlan(sheets).sheets;
  return {
    ...plan,
    sheets: plan.sheets.map((entry) => {
      const guess = guessed[entry.sheet];
      if (!guess || entry.layout === "skip" || entry.layout === "teams_only") return entry;
      if (guess.headerRow !== entry.headerRow && entry.headerRow !== null) return entry;
      const used = new Set(
        [...COLUMN_KEYS.map((key) => entry[key]), ...entry.memberColumns, ...entry.memberEmailColumns].filter(
          (value) => value !== null,
        ),
      );
      const next = { ...entry, headerRow: entry.headerRow ?? guess.headerRow };
      for (const key of COLUMN_KEYS) {
        if (key === "challengeColumn" && !allowChallenges) continue;
        const value = guess[key];
        if (next[key] === null && value !== null && !used.has(value)) {
          next[key] = value;
          used.add(value);
        }
      }
      return next;
    }),
  };
}

/** Muestra para el agente: pocas filas, celdas cortas y correos enmascarados. */
export function describeSheets(sheets: Sheet[], rowsPerSheet = 25) {
  const mask = (value: string) =>
    value.replace(new RegExp(EMAIL.source, "gi"), (email) => {
      const [local, domain] = email.split("@");
      return `${local.slice(0, 1)}***@${domain}`;
    });
  return sheets
    .map((sheet, index) => {
      const width = Math.max(0, ...sheet.rows.map((row) => row.length));
      const sample = sheet.rows.slice(0, rowsPerSheet).map((row, rowIndex) => {
        const cells = row
          .map((value, col) => (clean(value) ? `[${col}] ${mask(clean(value)).slice(0, 60)}` : null))
          .filter(Boolean)
          .join(" | ");
        return `fila ${rowIndex}: ${cells || "(vacía)"}`;
      });
      const more = sheet.rows.length > rowsPerSheet ? `\n… (${sheet.rows.length - rowsPerSheet} filas más con la misma estructura)` : "";
      return `### Hoja ${index}: «${sheet.name}» (${sheet.rows.length} filas, ${width} columnas)\n${sample.join("\n")}${more}`;
    })
    .join("\n\n");
}

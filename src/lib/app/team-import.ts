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

  for (const sheetPlan of plan.sheets) {
    const sheet = sheets[sheetPlan.sheet];
    if (!sheet || sheetPlan.layout === "skip") continue;
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
      if (!row.some((value) => clean(value))) continue;
      const teamCell = cell(row, sheetPlan.teamColumn);
      const { challenge, number } = meta(row);

      if (sheetPlan.layout === "teams_only") {
        const name = teamCell || (sheetPlan.teamColumn === null ? clean(row.find((value) => clean(value))) : "");
        if (name) addTeam(name.slice(0, 120), challenge, number);
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
 * Plan sin IA (por si no está configurada o falla): busca títulos conocidos en
 * la primera fila de cada hoja. Cubre los casos sencillos.
 */
export function guessPlan(sheets: Sheet[]): ImportPlan {
  const plans: SheetPlan[] = sheets.map((sheet, index) => {
    const header = (sheet.rows[0] ?? []).map(clean);
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
    const hasHeader = Object.values(columns).some((value) => value !== null) || memberColumns.length > 0;
    let emailColumn = columns.emailColumn;
    if (emailColumn === null) {
      const sample = sheet.rows.slice(hasHeader ? 1 : 0, 20);
      const width = Math.max(0, ...sample.map((row) => row.length));
      for (let i = 0; i < width && emailColumn === null; i += 1) {
        if (sample.some((row) => EMAIL.test(row[i] ?? ""))) emailColumn = i;
      }
    }
    const hasPerson = columns.nameColumn !== null || columns.firstNameColumn !== null || emailColumn !== null;
    const layout: SheetPlan["layout"] = memberColumns.length
      ? "team_rows"
      : hasPerson
        ? "person_rows"
        : sheet.rows.length
          ? "teams_only"
          : "skip";
    return {
      sheet: index,
      layout,
      headerRow: hasHeader ? 0 : null,
      ...columns,
      nameColumn: columns.nameColumn ?? (!hasHeader && emailColumn !== null && emailColumn > 0 ? 0 : null),
      emailColumn,
      memberColumns,
      memberEmailColumns: [],
      teamFromSheetName: false,
    };
  });
  return { sheets: plans, reply: "", questions: [] };
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

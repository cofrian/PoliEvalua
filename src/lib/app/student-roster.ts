import Papa from "papaparse";

// Lectura de listas de alumnado (pegadas o en CSV, p. ej. exportadas de
// PoliformaT) y reparto en grupos. Se usa en el navegador para la vista previa
// y en el servidor para validar lo que se confirma.

export type RosterStudent = { fullName: string; email: string; group: string | null };

export type GroupingMode = "column" | "random" | "alphabetical" | "none";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const headerHints = {
  name: /^(nombre|name|nom)$/i,
  surname: /^(apellidos?|surname|last ?name|cognoms)$/i,
  fullName: /^(nombre completo|full ?name|alumno|estudiante|student)$/i,
  email: /^(e-?mail|correo|correo electr[oó]nico|mail)$/i,
  group: /^(grupo|group|equipo|team|grup)$/i,
};

export type RosterError = { line: number; kind: "email" | "duplicate"; email?: string };

export function parseRoster(raw: string): { students: RosterStudent[]; errors: RosterError[] } {
  const text = raw.replace(/^﻿/, "").trim();
  if (!text) return { students: [], errors: [] };
  const delimiter = text.includes("\t") ? "\t" : text.includes(";") ? ";" : ",";
  const rows = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: true }).data.map((row) =>
    row.map((cell) => cell.trim()),
  );

  // Con cabecera se usan sus nombres; sin ella, la columna con @ es el correo,
  // la de antes el nombre y la de después (si existe) el grupo.
  const header = rows[0] ?? [];
  const hasHeader = header.some((cell) => Object.values(headerHints).some((hint) => hint.test(cell)));
  const find = (hint: RegExp) => header.findIndex((cell) => hint.test(cell));
  const columns = hasHeader
    ? {
        name: find(headerHints.name),
        surname: find(headerHints.surname),
        fullName: find(headerHints.fullName),
        email: find(headerHints.email),
        group: find(headerHints.group),
      }
    : null;

  const students: RosterStudent[] = [];
  const errors: RosterError[] = [];
  const seen = new Set<string>();

  (hasHeader ? rows.slice(1) : rows).forEach((row, index) => {
    const line = index + (hasHeader ? 2 : 1);
    let fullName = "";
    let email = "";
    let group: string | null = null;

    if (columns && columns.email >= 0) {
      email = row[columns.email] ?? "";
      fullName =
        columns.fullName >= 0
          ? row[columns.fullName] ?? ""
          : [row[columns.name], row[columns.surname]].filter(Boolean).join(" ");
      group = columns.group >= 0 ? row[columns.group] || null : null;
    } else {
      const emailIndex = row.findIndex((cell) => EMAIL.test(cell));
      if (emailIndex >= 0) {
        email = row[emailIndex];
        fullName = row.slice(0, emailIndex).filter(Boolean).join(" ");
        group = row[emailIndex + 1] || null;
      }
    }

    email = email.toLowerCase();
    if (!EMAIL.test(email)) {
      errors.push({ line, kind: "email" });
      return;
    }
    if (seen.has(email)) {
      errors.push({ line, kind: "duplicate", email });
      return;
    }
    seen.add(email);
    students.push({ fullName: fullName || email.split("@")[0], email, group });
  });

  return { students, errors };
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Reparte en grupos de tamaño parecido (nunca difieren en más de una persona). */
export function assignGroups(
  students: RosterStudent[],
  mode: GroupingMode,
  groupSize: number,
  groupName: (index: number) => string = (index) => `Grupo ${index}`,
): RosterStudent[] {
  if (mode === "column" || mode === "none") {
    return students.map((student) => ({ ...student, group: mode === "none" ? null : student.group }));
  }
  const ordered =
    mode === "random"
      ? shuffle(students)
      : [...students].sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));
  const groups = Math.max(1, Math.round(ordered.length / Math.max(1, groupSize)));
  // Bloques consecutivos: en orden alfabético, cada grupo es un tramo de la lista.
  return ordered.map((student, index) => ({
    ...student,
    group: groupName(Math.floor((index * groups) / ordered.length) + 1),
  }));
}

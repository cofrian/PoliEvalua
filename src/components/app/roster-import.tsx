"use client";

import { useActionState, useMemo, useState } from "react";

import { importRosterAction, type RosterImportState } from "@/app/(app)/admin/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "@/lib/app/ui";
import { assignGroups, parseRoster, type GroupingMode } from "@/lib/app/student-roster";

/**
 * Alta de alumnado en dos pasos: pegar o subir la lista, revisar la vista
 * previa con los grupos y confirmar. Nada se guarda hasta confirmar.
 */
export function RosterImport({ unit, units }: { unit: string; units: string }) {
  const [state, formAction] = useActionState<RosterImportState, FormData>(importRosterAction, null);
  const [raw, setRaw] = useState("");
  const [mode, setMode] = useState<GroupingMode>("random");
  const [groupSize, setGroupSize] = useState(4);
  const [seed, setSeed] = useState(0);

  const { students, errors } = useMemo(() => parseRoster(raw), [raw]);
  const hasGroupColumn = students.some((student) => student.group);
  const effectiveMode: GroupingMode = mode === "column" && !hasGroupColumn ? "random" : mode;
  // seed solo sirve para volver a barajar al pulsar «Repartir de nuevo».
  const assigned = useMemo(
    () => (seed >= 0 ? assignGroups(students, effectiveMode, groupSize) : []),
    [students, effectiveMode, groupSize, seed],
  );
  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const student of assigned) {
      if (!student.group) continue;
      map.set(student.group, [...(map.get(student.group) ?? []), student.fullName]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "es", { numeric: true }));
  }, [assigned]);

  async function loadFile(file: File | undefined) {
    if (file) setRaw(await file.text());
  }

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pega la lista o sube el CSV exportado de PoliformaT. Cada fila necesita nombre y correo; si
        hay una columna «Grupo», se respeta. Quien entre en el espacio con ese correo quedará
        vinculado a su {unit.toLowerCase()} automáticamente.
      </p>
      <input
        accept=".csv,.tsv,.txt,text/csv,text/plain"
        aria-label="Archivo con la lista de alumnado"
        className="block text-sm"
        onChange={(event) => void loadFile(event.target.files?.[0])}
        type="file"
      />
      <Textarea
        aria-label="Lista de alumnado"
        className="min-h-28 font-mono text-xs"
        onChange={(event) => setRaw(event.target.value)}
        placeholder={"Nombre;Apellidos;Correo;Grupo\nAna;García López;agarlop@upv.edu.es;Grupo 1"}
        value={raw}
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="grouping">Formar {units.toLowerCase()}</Label>
          <select
            className={selectClass}
            id="grouping"
            onChange={(event) => setMode(event.target.value as GroupingMode)}
            value={mode}
          >
            <option disabled={!hasGroupColumn} value="column">Usar la columna «Grupo»</option>
            <option value="random">Al azar</option>
            <option value="alphabetical">Por orden alfabético</option>
          </select>
        </div>
        {effectiveMode === "random" || effectiveMode === "alphabetical" ? (
          <div className="space-y-1">
            <Label htmlFor="groupSize">Personas por {unit.toLowerCase()}</Label>
            <Input
              className="h-9 w-24"
              id="groupSize"
              max={20}
              min={1}
              onChange={(event) => setGroupSize(Math.max(1, Number(event.target.value) || 1))}
              type="number"
              value={groupSize}
            />
          </div>
        ) : null}
        {effectiveMode === "random" && students.length ? (
          <button
            className="h-9 rounded-md border border-input px-3 text-sm font-semibold hover:bg-muted"
            onClick={() => setSeed((value) => value + 1)}
            type="button"
          >
            Repartir de nuevo
          </button>
        ) : null}
      </div>

      {errors.length ? (
        <ul className="rounded-lg border border-coral-400/50 bg-coral-400/10 px-4 py-2 text-sm" role="alert">
          {errors.slice(0, 8).map((error) => <li key={error}>{error}</li>)}
          {errors.length > 8 ? <li>… y {errors.length - 8} más.</li> : null}
        </ul>
      ) : null}

      {groups.length ? (
        <div>
          <p className="mb-2 text-sm font-semibold">
            Vista previa: {students.length} estudiantes en {groups.length} {units.toLowerCase()}
          </p>
          <div className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {groups.map(([name, members]) => (
              <div className="rounded-lg border border-line p-3 text-sm dark:border-[#262838]" key={name}>
                <p className="font-semibold">{name} · {members.length}</p>
                <p className="text-muted-foreground">{members.join(", ")}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <input name="roster" type="hidden" value={JSON.stringify(assigned)} />
      {state ? (
        <p
          className={
            state.ok
              ? "rounded-lg border border-leaf-500/50 bg-leaf-500/10 px-3 py-2 text-sm"
              : "rounded-lg border border-coral-400/50 bg-coral-400/10 px-3 py-2 text-sm"
          }
          role="status"
        >
          {state.message}
        </p>
      ) : null}
      {groups.length ? (
        <div className="max-w-xs">
          <SubmitButton idleLabel={`Dar de alta ${students.length} estudiantes`} pendingLabel="Guardando…" />
        </div>
      ) : null}
    </form>
  );
}

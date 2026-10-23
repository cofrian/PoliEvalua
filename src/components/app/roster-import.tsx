"use client";

import { useTranslations } from "next-intl";
import { useActionState, useMemo, useState } from "react";

import { FileField } from "@/components/app/file-field";
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
  const t = useTranslations("roster");
  const [raw, setRaw] = useState("");
  const [mode, setMode] = useState<GroupingMode>("random");
  const [groupSize, setGroupSize] = useState(4);
  const [seed, setSeed] = useState(0);

  const { students, errors } = useMemo(() => parseRoster(raw), [raw]);
  const hasGroupColumn = students.some((student) => student.group);
  const effectiveMode: GroupingMode = mode === "column" && !hasGroupColumn ? "random" : mode;
  // seed solo sirve para volver a barajar al pulsar «Repartir de nuevo».
  const assigned = useMemo(
    () =>
      seed >= 0
        ? assignGroups(students, effectiveMode, groupSize, (index) => t("groupName", { unit, index }))
        : [],
    [students, effectiveMode, groupSize, seed, t, unit],
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
        {t("help", { unit: unit.toLowerCase() })}
      </p>
      <FileField
        accept=".csv,.tsv,.txt,text/csv,text/plain"
        label={t("file")}
        onChange={(event) => void loadFile(event.target.files?.[0])}
      />
      <Textarea
        aria-label={t("list")}
        className="min-h-28 font-mono text-xs"
        onChange={(event) => setRaw(event.target.value)}
        placeholder={t("placeholder")}
        value={raw}
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="grouping">{t("form", { units: units.toLowerCase() })}</Label>
          <select
            className={selectClass}
            id="grouping"
            onChange={(event) => setMode(event.target.value as GroupingMode)}
            value={mode}
          >
            <option disabled={!hasGroupColumn} value="column">{t("useColumn")}</option>
            <option value="random">{t("random")}</option>
            <option value="alphabetical">{t("alphabetical")}</option>
          </select>
        </div>
        {effectiveMode === "random" || effectiveMode === "alphabetical" ? (
          <div className="space-y-1">
            <Label htmlFor="groupSize">{t("perUnit", { unit: unit.toLowerCase() })}</Label>
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
            {t("reshuffle")}
          </button>
        ) : null}
      </div>

      {errors.length ? (
        <ul className="rounded-lg border border-coral-400/50 bg-coral-400/10 px-4 py-2 text-sm" role="alert">
          {errors.slice(0, 8).map((error) => (
            <li key={`${error.line}-${error.kind}`}>
              {error.kind === "email"
                ? t("errorEmail", { line: error.line })
                : t("errorDuplicate", { line: error.line, email: error.email ?? "" })}
            </li>
          ))}
          {errors.length > 8 ? <li>{t("more", { count: errors.length - 8 })}</li> : null}
        </ul>
      ) : null}

      {groups.length ? (
        <div>
          <p className="mb-2 text-sm font-semibold">
            {t("preview", { students: students.length, groups: groups.length, units: units.toLowerCase() })}
          </p>
          <div className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {groups.map(([name, members]) => (
              <div className="rounded-lg border border-border p-3 text-sm" key={name}>
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
          <SubmitButton idleLabel={t("submit", { count: students.length })} pendingLabel={t("saving")} />
        </div>
      ) : null}
    </form>
  );
}

"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useMemo, useState } from "react";

import { applyTeamImportAction, type RosterImportState } from "@/app/(app)/admin/actions";
import { FileField } from "@/components/app/file-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "@/lib/app/ui";
import { assignGroups } from "@/lib/app/student-roster";
import type { ImportedPerson, ImportedTeam } from "@/lib/app/team-import";

type Analysis = {
  teams: ImportedTeam[];
  people: ImportedPerson[];
  reply: string;
  questions: string[];
  notice: string | null;
  usedAi: boolean;
  sheets: { name: string; rows: number }[];
};

type UnassignedMode = "leave" | "random" | "alphabetical" | "manual";

/**
 * Importación con IA: se sube un Excel o CSV con cualquier forma, el asistente
 * entiende qué columna es qué y se revisa una vista previa antes de guardar.
 * Quien no tenga grupo se puede dejar fuera, repartir o asignar a mano.
 */
export function SmartTeamImport({
  unit,
  units,
  existingTeams,
}: {
  unit: string;
  units: string;
  existingTeams: string[];
}) {
  const t = useTranslations("teamImport");
  const [state, formAction] = useActionState<RosterImportState, FormData>(applyTeamImportAction, null);
  const [file, setFile] = useState<File | null>(null);
  const [raw, setRaw] = useState("");
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [mode, setMode] = useState<UnassignedMode>("leave");
  const [groupSize, setGroupSize] = useState(4);
  const [seed, setSeed] = useState(0);
  const [manual, setManual] = useState<Record<number, string>>({});
  const [newTeam, setNewTeam] = useState("");
  const [extraTeams, setExtraTeams] = useState<string[]>([]);

  async function analyze() {
    setLoading(true);
    setError(null);
    const body = new FormData();
    if (file) body.set("file", file);
    else body.set("content", raw);
    if (hint.trim()) body.set("hint", hint.trim());
    try {
      const response = await fetch("/api/team-import", { method: "POST", body });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json) throw new Error(json?.error ?? t("failed"));
      setAnalysis(json as Analysis);
      setManual({});
      setExtraTeams([]);
      const unassigned = (json as Analysis).people.filter((person) => !person.team).length;
      setMode(unassigned ? "manual" : "leave");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("failed"));
    } finally {
      setLoading(false);
    }
  }

  const teamNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const name of [...(analysis?.teams.map((team) => team.name) ?? []), ...existingTeams, ...extraTeams]) {
      if (!names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  }, [analysis, existingTeams, extraTeams]);

  // Personas sin grupo en el archivo, con su posición para la asignación manual.
  const unassigned = useMemo(
    () =>
      (analysis?.people ?? [])
        .map((person, index) => ({ ...person, index }))
        .filter((person) => !person.team),
    [analysis],
  );

  const finalPeople = useMemo(() => {
    if (!analysis) return [];
    const people = analysis.people.map((person) => ({ ...person }));
    if (mode === "manual") {
      for (const person of unassigned) people[person.index].team = manual[person.index] || null;
    } else if ((mode === "random" || mode === "alphabetical") && unassigned.length && seed >= 0) {
      // Nombres de grupo nuevos que no choquen con los que ya existen.
      const taken = new Set(teamNames.map((name) => name.toLowerCase()));
      const free: string[] = [];
      for (let candidate = 1; free.length < unassigned.length; candidate += 1) {
        const name = t("groupName", { unit, index: candidate });
        if (!taken.has(name.toLowerCase())) free.push(name);
      }
      const nameFor = (index: number) => free[index - 1];
      const placed = assignGroups(
        unassigned.map((person) => ({ fullName: person.fullName, email: String(person.index), group: null })),
        mode,
        groupSize,
        nameFor,
      );
      for (const person of placed) people[Number(person.email)].team = person.group;
    }
    return people;
  }, [analysis, mode, unassigned, manual, groupSize, seed, teamNames, t, unit]);

  const preview = useMemo(() => {
    const groups = new Map<string, ImportedPerson[]>();
    for (const team of analysis?.teams ?? []) groups.set(team.name, []);
    for (const person of finalPeople) {
      if (!person.team) continue;
      groups.set(person.team, [...(groups.get(person.team) ?? []), person]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "es", { numeric: true }));
  }, [analysis, finalPeople]);

  const left = finalPeople.filter((person) => !person.team).length;
  const withoutEmail = finalPeople.filter((person) => person.team && !person.email).length;
  const toSave = finalPeople.length - left;
  const payload = analysis
    ? JSON.stringify({
        teams: [
          ...analysis.teams,
          // Los grupos añadidos a mano solo se crean si alguien va a ellos.
          ...extraTeams
            .filter((name) => finalPeople.some((person) => person.team === name))
            .map((name) => ({ name, challenge: null, number: null })),
        ],
        people: finalPeople,
      })
    : "";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("help", { units: units.toLowerCase() })}</p>
      <FileField
        accept=".xlsx,.csv,.tsv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        label={t("file")}
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      {!file ? (
        <Textarea
          aria-label={t("paste")}
          className="min-h-24 font-mono text-xs"
          onChange={(event) => setRaw(event.target.value)}
          placeholder={t("placeholder")}
          value={raw}
        />
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="import-hint">{t("hint")}</Label>
        <Input
          id="import-hint"
          maxLength={1000}
          onChange={(event) => setHint(event.target.value)}
          placeholder={t("hintPlaceholder", { unit: unit.toLowerCase() })}
          value={hint}
        />
      </div>
      <Button disabled={loading || (!file && !raw.trim())} onClick={() => void analyze()} type="button">
        <Sparkles aria-hidden="true" /> {loading ? t("analyzing") : analysis ? t("reanalyze") : t("analyze")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("privacy")}</p>

      {error ? (
        <p className="rounded-lg border border-coral-400/50 bg-coral-400/10 px-3 py-2 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {analysis ? (
        <form action={formAction} className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm" role="status">
            {analysis.reply ? <p>{analysis.reply}</p> : null}
            {analysis.notice ? <p className="mt-1 text-muted-foreground">{analysis.notice}</p> : null}
            {analysis.questions.length ? (
              <div className="mt-2">
                <p className="font-semibold">{t("questions")}</p>
                <ul className="list-disc pl-5">
                  {analysis.questions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
                <p className="mt-1 text-muted-foreground">{t("questionsHelp")}</p>
              </div>
            ) : null}
            <p className="mt-2 font-semibold">
              {t("summary", {
                teams: preview.length,
                units: units.toLowerCase(),
                people: finalPeople.length,
                unassigned: unassigned.length,
              })}
            </p>
          </div>

          {unassigned.length ? (
            <fieldset className="space-y-3 rounded-lg border border-border p-4">
              <legend className="px-1 text-sm font-semibold">
                {t("unassignedTitle", { count: unassigned.length, unit: unit.toLowerCase() })}
              </legend>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <Label htmlFor="unassigned-mode">{t("whatToDo")}</Label>
                  <select
                    className={selectClass}
                    id="unassigned-mode"
                    onChange={(event) => setMode(event.target.value as UnassignedMode)}
                    value={mode}
                  >
                    <option value="manual">{t("modes.manual")}</option>
                    <option value="random">{t("modes.random", { units: units.toLowerCase() })}</option>
                    <option value="alphabetical">{t("modes.alphabetical", { units: units.toLowerCase() })}</option>
                    <option value="leave">{t("modes.leave")}</option>
                  </select>
                </div>
                {mode === "random" || mode === "alphabetical" ? (
                  <div className="space-y-1">
                    <Label htmlFor="import-group-size">{t("perUnit", { unit: unit.toLowerCase() })}</Label>
                    <Input
                      className="h-9 w-24"
                      id="import-group-size"
                      max={20}
                      min={1}
                      onChange={(event) => setGroupSize(Math.max(1, Number(event.target.value) || 1))}
                      type="number"
                      value={groupSize}
                    />
                  </div>
                ) : null}
                {mode === "random" ? (
                  <Button onClick={() => setSeed((value) => value + 1)} type="button" variant="outline">
                    {t("reshuffle")}
                  </Button>
                ) : null}
              </div>

              {mode === "manual" ? (
                <>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="import-new-team">{t("newTeam", { unit: unit.toLowerCase() })}</Label>
                      <Input
                        className="h-9 w-56"
                        id="import-new-team"
                        maxLength={120}
                        onChange={(event) => setNewTeam(event.target.value)}
                        value={newTeam}
                      />
                    </div>
                    <Button
                      disabled={!newTeam.trim() || teamNames.some((name) => name.toLowerCase() === newTeam.trim().toLowerCase())}
                      onClick={() => {
                        setExtraTeams((list) => [...list, newTeam.trim()]);
                        setNewTeam("");
                      }}
                      type="button"
                      variant="outline"
                    >
                      {t("addTeam")}
                    </Button>
                  </div>
                  <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border">
                    {unassigned.map((person) => (
                      <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" key={person.index}>
                        <span>
                          {person.fullName}
                          {person.email ? <span className="text-muted-foreground"> · {person.email}</span> : null}
                        </span>
                        <select
                          aria-label={t("assignTo", { name: person.fullName })}
                          className={selectClass}
                          onChange={(event) => setManual((current) => ({ ...current, [person.index]: event.target.value }))}
                          value={manual[person.index] ?? ""}
                        >
                          <option value="">{t("noTeam", { unit: unit.toLowerCase() })}</option>
                          {teamNames.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </fieldset>
          ) : null}

          {preview.length ? (
            <div className="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {preview.map(([name, members]) => {
                const team = analysis.teams.find((item) => item.name === name);
                const exists = existingTeams.some((item) => item.toLowerCase() === name.toLowerCase());
                return (
                  <div className="rounded-lg border border-border p-3 text-sm" key={name}>
                    <p className="font-semibold">
                      {team?.number ? `${team.number}. ` : ""}
                      {name} · {members.length}
                    </p>
                    {team?.challenge ? <p className="text-xs text-muted-foreground">{team.challenge}</p> : null}
                    {exists ? <p className="text-xs text-muted-foreground">{t("alreadyExists")}</p> : null}
                    <p className="text-muted-foreground">
                      {members.length ? members.map((member) => member.fullName).join(", ") : t("empty")}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : null}

          {left || withoutEmail ? (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {left ? <li>{t("leftOut", { count: left })}</li> : null}
              {withoutEmail ? <li>{t("withoutEmail", { count: withoutEmail })}</li> : null}
            </ul>
          ) : null}

          <input name="payload" type="hidden" value={payload} />
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
          {preview.length ? (
            <div className="max-w-sm">
              <SubmitButton
                idleLabel={t("submit", { teams: preview.length, units: units.toLowerCase(), people: toSave })}
                pendingLabel={t("saving")}
              />
            </div>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

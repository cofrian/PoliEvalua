"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type TeamSummary = {
  id: string;
  number: number | null;
  name: string;
  projectTitle: string | null;
  challengeId: string | null;
  memberCount: number;
  myNotes: number;
  sharedNotes: number;
  status: "pending" | "draft" | "submitted" | "incomplete";
};

const statusStyles = {
  submitted: "border-leaf-500/50 bg-leaf-500/15",
  draft: "border-orange-500/50 bg-orange-500/15",
  incomplete: "border-coral-400/60 bg-coral-400/15",
  pending: "border-line bg-transparent dark:border-[#262838]",
} as const;

const statusLabels = {
  submitted: "✔ Evaluado",
  draft: "Borrador",
  incomplete: "⚠ Incompleta",
  pending: "Pendiente",
} as const;

export function TeamsBrowser({
  challenges,
  teams,
  canVote,
}: {
  challenges: { id: string; name: string }[];
  teams: TeamSummary[];
  canVote: boolean;
}) {
  const [challenge, setChallenge] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teams.filter(
      (team) =>
        (challenge === "all" || team.challengeId === challenge) &&
        (!q ||
          team.name.toLowerCase().includes(q) ||
          team.projectTitle?.toLowerCase().includes(q) ||
          String(team.number) === q),
    );
  }, [teams, challenge, query]);

  const tabs = [{ id: "all", name: "Todos" }, ...challenges];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">Equipos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {teams.length} equipos ·{" "}
            {canVote
              ? `${teams.filter((t) => t.status === "submitted").length} evaluados por ti`
              : "como mentor puedes tomar notas, no votar"}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Buscar equipo"
            className="h-10 pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o número"
            value={query}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-selected={challenge === tab.id}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors",
              challenge === tab.id
                ? "border-navy-900 bg-navy-900 text-white dark:border-orange-100 dark:bg-orange-100 dark:text-navy-900"
                : "border-line hover:bg-navy-900/5 dark:border-[#262838] dark:hover:bg-white/10",
            )}
            key={tab.id}
            onClick={() => setChallenge(tab.id)}
            role="tab"
            type="button"
          >
            {tab.name}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          No hay equipos que coincidan.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((team) => (
            <li key={team.id}>
              <Link
                className="flex h-full flex-col gap-3 rounded-xl border border-line bg-white p-4 shadow-warm transition hover:-translate-y-0.5 dark:border-[#262838] dark:bg-[#151621]"
                href={`/equipos/${team.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground">
                      {challenges.find((c) => c.id === team.challengeId)?.name}{" "}
                      · #{team.number}
                    </p>
                    <h2 className="font-display text-xl leading-tight">
                      {team.name}
                    </h2>
                    {team.projectTitle ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {team.projectTitle}
                      </p>
                    ) : null}
                  </div>
                  {canVote ? (
                    <Badge
                      className={cn("shrink-0 border", statusStyles[team.status])}
                      variant="outline"
                    >
                      {statusLabels[team.status]}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-auto text-xs text-muted-foreground">
                  {team.memberCount} integrantes · {team.myNotes} notas mías ·{" "}
                  {team.sharedNotes} compartidas
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

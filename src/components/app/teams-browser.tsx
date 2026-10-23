"use client";

import { Search, UsersRound } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  canEvaluate: boolean;
  status: "pending" | "draft" | "submitted" | "incomplete";
};

const statusStyles = {
  submitted: "border-leaf-500/50 bg-leaf-500/15",
  draft: "border-orange-500/50 bg-orange-500/15",
  incomplete: "border-coral-400/60 bg-coral-400/15",
  pending: "border-border bg-transparent",
} as const;

export function TeamsBrowser({
  challenges,
  teams,
  canVote,
  title,
  isAdmin = false,
  mode = "teams",
}: {
  challenges: { id: string; name: string }[];
  teams: TeamSummary[];
  canVote: boolean;
  /** Nombre de la unidad en plural según el tipo de espacio. */
  title: string;
  /** Quien gestiona ve cómo crear la lista cuando aún está vacía. */
  isAdmin?: boolean;
  /** Tipo de unidad, para nombrarla bien en singular. */
  mode?: string;
}) {
  const t = useTranslations("teams");
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

  const tabs = [{ id: "all", name: t("all") }, ...challenges];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("count", { count: teams.length, units: title.toLowerCase() })} ·{" "}
            {canVote
              ? t("evaluatedByYou", { count: teams.filter((team) => team.status === "submitted").length })
              : t("mentorHint")}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label={t("searchLabel", { mode })}
            className="h-10 pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            value={query}
          />
        </div>
      </div>

      {challenges.length ? (
      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-selected={challenge === tab.id}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors",
              challenge === tab.id
                ? "border-navy-900 bg-navy-900 text-white dark:border-orange-100 dark:bg-orange-100 dark:text-navy-900"
                : "border-border hover:bg-navy-900/5 dark:hover:bg-white/10",
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
      ) : null}

      {teams.length === 0 ? (
        <EmptyState
          action={
            isAdmin ? (
              <Button asChild>
                <Link href="/admin/equipos">{t("createOrImport", { units: title.toLowerCase() })}</Link>
              </Button>
            ) : null
          }
          description={
            isAdmin
              ? t("emptyAdmin")
              : t("emptyOther")
          }
          icon={<UsersRound aria-hidden="true" />}
          title={t("emptyTitle", { units: title.toLowerCase() })}
        />
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          {t("noMatch", { query })}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((team) => (
            <li key={team.id}>
              <Link
                className="flex h-full flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-warm transition hover:-translate-y-0.5 dark:bg-card"
                href={`/equipos/${team.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground">
                      {[challenges.find((c) => c.id === team.challengeId)?.name, `#${team.number}`]
                        .filter(Boolean)
                        .join(" · ")}
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
                  {team.canEvaluate ? (
                    <Badge
                      className={cn("shrink-0 border", statusStyles[team.status])}
                      variant="outline"
                    >
                      {t(`status.${team.status}`)}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-auto text-xs text-muted-foreground">
                  {t("members", { count: team.memberCount })}
                  {team.myNotes ? ` · ${t("myNotes", { count: team.myNotes })}` : ""}
                  {team.sharedNotes ? ` · ${t("sharedNotes", { count: team.sharedNotes })}` : ""}
                </p>
                {canVote && !team.canEvaluate ? (
                  <p className="text-xs font-semibold text-orange-700 dark:text-orange-300">
                    {t("otherPanel")}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

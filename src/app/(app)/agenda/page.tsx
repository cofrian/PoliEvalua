import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { AgendaBoard } from "@/components/app/agenda-board";
import { AgendaLiveRefresh } from "@/components/app/agenda-live-refresh";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { loadAgenda } from "@/lib/app/agenda-data";
import { getSession } from "@/lib/app/session";

export default async function AgendaPage() {
  const { supabase, user, event, canVote, role, words, isAdmin } = await getSession();
  const t = await getTranslations("agenda");
  const [slots, { data: myTeam }] = await Promise.all([
    loadAgenda(supabase, event.id),
    role === "student"
      ? supabase
          .from("team_members")
          .select("team_id")
          .eq("event_id", event.id)
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="space-y-6">
      <AgendaLiveRefresh eventId={event.id} />
      <div>
        <h1 className="font-display text-2xl tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("subtitle")}
          {myTeam ? t("highlight", { mode: words.mode }) : ""}
        </p>
      </div>
      {slots.length ? (
        <AgendaBoard canRunRoom={canVote} highlightTeamId={myTeam?.team_id ?? null} slots={slots} />
      ) : (
        <EmptyState
          action={
            isAdmin ? (
              <Button asChild>
                <Link href="/admin/agenda">{t("emptyAction")}</Link>
              </Button>
            ) : null
          }
          description={isAdmin ? t("emptyAdmin") : t("emptyOther")}
          icon={<CalendarDays aria-hidden="true" />}
          title={t("empty")}
        />
      )}
    </div>
  );
}

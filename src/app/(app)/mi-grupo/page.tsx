import { CalendarClock, ClipboardList, Mic2, Users } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { AgendaLiveRefresh } from "@/components/app/agenda-live-refresh";
import { SpaceCover } from "@/components/app/space-cover";
import {
  PeerSummaryView,
  TeamFeedbackView,
  type PeerSummary,
  type TeamFeedback,
} from "@/components/app/team-feedback-view";
import { peerReviewSettings } from "@/lib/app/peer-review";
import { TeamLinks, type TeamLink } from "@/components/app/team-links";
import { scheduleRoom, timeFormat } from "@/lib/app/agenda";
import { loadAgenda } from "@/lib/app/agenda-data";
import { getSession } from "@/lib/app/session";
import { cardClass } from "@/lib/app/ui";

/** Punto de partida del alumnado: su grupo, sus entregas y lo que necesita saber. */
export default async function MyGroupPage() {
  const { supabase, user, event, words, recording, eventClosed, branding } = await getSession();
  const [t, tNav, tAgenda] = await Promise.all([
    getTranslations("myGroup"),
    getTranslations("nav"),
    getTranslations("agenda"),
  ]);

  const { data: membership } = await supabase
    .from("team_members")
    .select(
      "team:teams(id, number, name, project_title, team_members(id, full_name, user_id), team_links(id, kind, url, label, created_at))",
    )
    .eq("event_id", event.id)
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  type Team = {
    id: string;
    number: number | null;
    name: string;
    project_title: string | null;
    team_members: { id: string; full_name: string; user_id: string | null }[];
    team_links: (TeamLink & { created_at: string })[];
  };
  const relation = membership?.team as unknown as Team | Team[] | null | undefined;
  const team = Array.isArray(relation) ? relation[0] : relation;

  if (!team) {
    return (
      <div className={`${cardClass} mx-auto max-w-xl space-y-2`}>
        <h1 className="font-display text-xl">{t("noneTitle", { mode: words.mode })}</h1>
        <p className="text-sm text-muted-foreground">
          {t("noneText")}
        </p>
      </div>
    );
  }

  const links = [...team.team_links].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const peerSettings = peerReviewSettings(event.settings);
  const [agenda, feedbackResult, peerResult, { data: rubric }] = await Promise.all([
    loadAgenda(supabase, event.id),
    words.resultsPublished
      ? supabase.rpc("team_feedback", { target_team: team.id })
      : Promise.resolve({ data: null }),
    words.resultsPublished && peerSettings.enabled
      ? supabase.rpc("team_peer_summary", { target_team: team.id })
      : Promise.resolve({ data: null }),
    supabase
      .from("rubrics")
      .select("scale_max, rubric_criteria(id, title, order, deleted_at)")
      .eq("event_id", event.id)
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  const feedback = (feedbackResult.data ?? null) as TeamFeedback | null;
  const peerSummary = (peerResult.data ?? null) as PeerSummary | null;
  const rubricCriteria = ((rubric?.rubric_criteria ?? []) as { id: string; title: string; order: number; deleted_at: string | null }[])
    .filter((criterion) => !criterion.deleted_at)
    .sort((a, b) => a.order - b.order);
  const mySlot = agenda.find((slot) => slot.team_id === team.id);
  const myScheduled = mySlot
    ? scheduleRoom(agenda.filter((slot) => slot.room === mySlot.room)).find((slot) => slot.id === mySlot.id)
    : null;

  return (
    <div className="space-y-6">
      {mySlot ? <AgendaLiveRefresh eventId={event.id} /> : null}
      <SpaceCover
        color={branding.color}
        eyebrow={`${tNav("myUnit", { mode: words.mode })} · #${team.number ?? "–"}`}
        logoUrl={branding.logoUrl}
        name={team.name}
        subtitle={team.project_title}
      />

      {myScheduled ? (
        <Link
          className={`${cardClass} flex flex-wrap items-center gap-x-6 gap-y-1 hover:bg-muted ${
            myScheduled.status === "live" ? "border-destructive" : ""
          }`}
          href="/agenda"
        >
          <span className="flex items-center gap-2 font-semibold">
            <CalendarClock aria-hidden="true" className="size-5 text-primary" /> {t("yourSlot")}
          </span>
          <span className="font-mono text-2xl font-bold">
            {myScheduled.status === "live"
              ? t("now")
              : myScheduled.expectedStart
                ? timeFormat.format(myScheduled.expectedStart)
                : t("tbc")}
          </span>
          <span className="text-sm text-muted-foreground">
            {myScheduled.room} · {myScheduled.duration_minutes} min · {tAgenda(`status.${myScheduled.status}`)}
            {myScheduled.delayMinutes && myScheduled.status === "pending"
              ? ` · ${t("delay", { minutes: myScheduled.delayMinutes })}`
              : ""}
          </span>
        </Link>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <section className={cardClass}>
          <h2 className="mb-2 flex items-center gap-2 font-display text-lg">
            <Users aria-hidden="true" className="size-4" /> {t("members")}
          </h2>
          <ul className="space-y-1 text-sm">
            {team.team_members.map((member) => (
              <li key={member.id}>
                {member.full_name}
                {member.user_id === user.id ? t("you") : ""}
              </li>
            ))}
          </ul>
        </section>

        <section className={cardClass}>
          <h2 className="mb-2 font-display text-lg">{t("deliverables")}</h2>
          <TeamLinks
            canEdit={!eventClosed}
            driveUrl={words.materials.driveUrl}
            eventId={event.id}
            initialLinks={links}
            instructions={words.materials.instructions}
            teamId={team.id}
          />
        </section>
      </div>

      {feedback ? (
        <section className={cardClass}>
          <h2 className="mb-4 font-display text-xl">{t("feedback")}</h2>
          <TeamFeedbackView feedback={feedback} />
        </section>
      ) : null}

      {peerSummary ? (
        <section className={cardClass}>
          <h2 className="mb-4 font-display text-xl">{t("peerReview")}</h2>
          <PeerSummaryView criteria={rubricCriteria} scaleMax={rubric?.scale_max ?? 10} summary={peerSummary} />
        </section>
      ) : null}

      {peerSettings.enabled && !eventClosed ? (
        <Link className={`${cardClass} block font-semibold hover:bg-muted`} href="/coevaluacion">
          {t("goPeerReview")}
        </Link>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {words.studentsSeeRubric && words.hasModule("rubric") ? (
          <Link className={`${cardClass} flex items-start gap-3 hover:bg-muted`} href="/rubrica">
            <ClipboardList aria-hidden="true" className="mt-0.5 size-5 text-primary" />
            <span>
              <strong className="block">{t("howEvaluated")}</strong>
              <span className="text-sm text-muted-foreground">
                {t("howEvaluatedText")}
              </span>
            </span>
          </Link>
        ) : null}
        {recording.enabled ? (
          <Link className={`${cardClass} flex items-start gap-3 hover:bg-muted`} href={`/equipos/${team.id}/presentaciones`}>
            <Mic2 aria-hidden="true" className="mt-0.5 size-5 text-primary" />
            <span>
              <strong className="block">{t("yourPresentation", { presentation: words.presentation })}</strong>
              <span className="text-sm text-muted-foreground">
                {t("recordingText")}
              </span>
            </span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

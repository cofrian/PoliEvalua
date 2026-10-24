import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ContributionForm, PeerReviewForm, type PeerCriterion } from "@/components/app/peer-review-form";
import { peerReviewSettings } from "@/lib/app/peer-review";
import { getSession } from "@/lib/app/session";
import { cardClass } from "@/lib/app/ui";

export default async function PeerReviewPage() {
  const { supabase, user, event, role, words, eventClosed } = await getSession();
  const settings = peerReviewSettings(event.settings);
  if (role !== "student" || !settings.enabled) redirect("/mi-grupo");
  const t = await getTranslations("peer");

  const [{ data: rubric }, { data: membership }, { data: assignments }, { data: reviews }, { data: contributions }] =
    await Promise.all([
      supabase
        .from("rubrics")
        .select("rubric_criteria(id, title, description, order, deleted_at, rubric_levels(score, label, descriptor))")
        .eq("event_id", event.id)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("team_members")
        .select("team:teams(id, name, team_members(id, full_name, user_id))")
        .eq("event_id", event.id)
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle(),
      supabase.from("peer_assignments").select("team:teams(id, name, number)").eq("event_id", event.id).eq("reviewer_id", user.id),
      supabase.from("peer_reviews").select("team_id, kind, scores, comment, status").eq("event_id", event.id).eq("reviewer_id", user.id),
      supabase.from("contribution_reviews").select("member_id, score").eq("event_id", event.id).eq("reviewer_id", user.id),
    ]);

  const criteria: PeerCriterion[] = (
    (rubric?.rubric_criteria ?? []) as {
      id: string;
      title: string;
      description: string | null;
      order: number;
      deleted_at: string | null;
      rubric_levels: { score: number; label: string; descriptor: string }[];
    }[]
  )
    .filter((criterion) => !criterion.deleted_at)
    .sort((a, b) => a.order - b.order)
    .map((criterion) => ({
      id: criterion.id,
      title: criterion.title,
      description: criterion.description,
      levels: [...criterion.rubric_levels].sort((a, b) => a.score - b.score),
    }));

  type Team = { id: string; name: string; team_members: { id: string; full_name: string; user_id: string | null }[] };
  const ownRelation = membership?.team as unknown as Team | Team[] | null | undefined;
  const ownTeam = Array.isArray(ownRelation) ? ownRelation[0] : ownRelation;
  const assigned = (assignments ?? []).flatMap((item) => {
    const relation = item.team as unknown as { id: string; name: string; number: number | null } | { id: string; name: string; number: number | null }[] | null;
    const team = Array.isArray(relation) ? relation[0] : relation;
    return team ? [team] : [];
  });
  const reviewFor = (teamId: string, kind: "peer" | "self") => {
    const review = (reviews ?? []).find((item) => item.team_id === teamId && item.kind === kind);
    return review
      ? {
          scores: (review.scores ?? {}) as Record<string, number>,
          comment: review.comment ?? "",
          status: review.status as "draft" | "submitted",
        }
      : null;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("intro", { evaluator: words.evaluator })}{" "}
          {t("anonymous")} {t("canCorrect")}
        </p>
      </div>

      {!ownTeam ? (
        <p className={cardClass}>{t("noTeam", { mode: words.mode })}</p>
      ) : null}

      {settings.peer ? (
        <section className="space-y-4">
          <h2 className="font-display text-xl">{t("assigned", { units: words.units })}</h2>
          {assigned.length ? (
            assigned.map((team) => (
              <details className={cardClass} key={team.id} open={reviewFor(team.id, "peer")?.status !== "submitted"}>
                <summary className="cursor-pointer font-semibold">
                  #{team.number} · {team.name}
                  {reviewFor(team.id, "peer")?.status === "submitted" ? t("sent") : ""}
                </summary>
                <div className="mt-4">
                  <PeerReviewForm
                    criteria={criteria}
                    eventId={event.id}
                    initial={reviewFor(team.id, "peer")}
                    kind="peer"
                    locked={eventClosed}
                    teamId={team.id}
                  />
                </div>
              </details>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">{t("notAssigned", { units: words.unitsLower })}</p>
          )}
        </section>
      ) : null}

      {settings.self && ownTeam ? (
        <section className="space-y-4">
          <h2 className="font-display text-xl">{t("selfTitle", { name: ownTeam.name })}</h2>
          <div className={cardClass}>
            <PeerReviewForm
              criteria={criteria}
              eventId={event.id}
              initial={reviewFor(ownTeam.id, "self")}
              kind="self"
              locked={eventClosed}
              teamId={ownTeam.id}
            />
          </div>
        </section>
      ) : null}

      {settings.contribution && ownTeam ? (
        <section className="space-y-4">
          <h2 className="font-display text-xl">{t("contributionTitle")}</h2>
          <div className={cardClass}>
            <ContributionForm
              eventId={event.id}
              initial={Object.fromEntries((contributions ?? []).map((item) => [item.member_id, item.score]))}
              locked={eventClosed}
              members={ownTeam.team_members
                .filter((member) => member.user_id !== user.id)
                .map((member) => ({ id: member.id, name: member.full_name }))}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}

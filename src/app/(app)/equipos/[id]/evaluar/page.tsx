import { ArrowLeft, Mic } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AiEvidencePanel } from "@/components/app/ai-evidence-panel";
import { EvaluationForm } from "@/components/app/evaluation-form";
import { NotesDrawer } from "@/components/app/notes-drawer";
import { NotesPanel } from "@/components/app/notes-panel";
import { PresentationStudio } from "@/components/app/presentation-studio";
import { PresentationTimer } from "@/components/app/presentation-timer";
import { loadPresentationData, recordingDisabledReason } from "@/lib/app/presentation-data";
import { RubricLiveUpdates } from "@/components/app/rubric-live-updates";
import { loadEvaluationContext } from "@/lib/app/evaluation-data";
import { getSession } from "@/lib/app/session";

export default async function EvaluatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const t = await getTranslations("evaluate");
  const { supabase, user, event, recording, role, isAdmin } = session;

  const { data: team } = await supabase
    .from("teams")
    .select("id, number, name")
    .eq("id", id)
    .eq("event_id", event.id)
    .maybeSingle();

  if (!team) notFound();

  const back = (
    <Link
      className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      href={`/equipos/${team.id}`}
    >
      <ArrowLeft className="size-4" /> {team.name}
    </Link>
  );

  const context = await loadEvaluationContext(session, team.id);
  if (!context.ok) {
    return (
      <div className="space-y-6">
        {back}
        <p
          className={
            context.tone === "warning"
              ? "rounded-xl border border-orange-500/50 bg-orange-500/10 p-6"
              : "rounded-xl border border-border bg-white p-6 dark:bg-card"
          }
        >
          {context.message}
        </p>
      </div>
    );
  }

  // Grabar sin salir de la evaluación: el jurado no tiene que ir a otra pantalla.
  const presentations = recording.enabled ? await loadPresentationData(supabase, event.id, team.id) : null;

  const aiPanel = (
    <AiEvidencePanel evidence={context.aiEvidence} processing={context.aiProcessing} teamId={team.id} />
  );

  return (
    <div className="space-y-6">
      {back}
      <h1 className="font-display text-2xl tracking-tight sm:text-3xl">{t("title", { team: team.name })}</h1>
      <PresentationTimer />

      {presentations ? (
        <details className="group rounded-xl border border-border bg-white p-4 dark:bg-card" open={presentations.records.length === 0}>
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold [&::-webkit-details-marker]:hidden">
            <Mic aria-hidden="true" className="size-4 text-upv-red" /> {t("record")}
            <span className="font-normal text-muted-foreground">
              · {presentations.records.length ? t("recordingsCount", { count: presentations.records.length }) : t("recordHint")}
            </span>
          </summary>
          <div className="mt-4">
            <PresentationStudio
              canCreate={role !== "viewer"}
              canManage={isAdmin}
              initialRecords={presentations.records}
              juryReports={presentations.juryReports}
              recordingDisabledReason={await recordingDisabledReason(recording.enabled, isAdmin)}
              teamId={team.id}
              userId={user.id}
            />
          </div>
        </details>
      ) : null}

      <details className="rounded-xl border border-border bg-white p-4 lg:hidden dark:bg-card">
        <summary className="cursor-pointer font-semibold">{t("aiSupport")}</summary>
        <div className="mt-3">{aiPanel}</div>
      </details>

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <EvaluationForm
          canShareWithTeam={context.hasStudents}
          criteria={context.criteria}
          eventId={event.id}
          initial={context.initial}
          locked={context.locked}
          page={context.page}
          rubricId={context.rubric.id}
          scaleMax={context.rubric.scale_max}
          teamId={team.id}
          userId={user.id}
        />
        <aside className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100svh-6rem)] lg:overflow-y-auto">
          <div className="mb-6 rounded-xl border border-border bg-white p-4 dark:bg-card">
            {aiPanel}
          </div>
          <h2 className="mb-3 font-display text-xl">{t("notes")}</h2>
          <NotesPanel
            eventId={event.id}
            initialNotes={context.notes}
            teamId={team.id}
            userId={user.id}
          />
        </aside>
      </div>
      <NotesDrawer
        eventId={event.id}
        initialNotes={context.notes}
        teamId={team.id}
        userId={user.id}
      />
      <RubricLiveUpdates rubricId={context.rubric.id} userId={user.id} />
    </div>
  );
}

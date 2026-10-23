import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AgendaLiveRefresh } from "@/components/app/agenda-live-refresh";
import { AiEvidencePanel } from "@/components/app/ai-evidence-panel";
import { EvaluationForm } from "@/components/app/evaluation-form";
import { NotesPanel } from "@/components/app/notes-panel";
import { PresentationStudio } from "@/components/app/presentation-studio";
import { SlotControls } from "@/components/app/slot-controls";
import { scheduleRoom, timeFormat } from "@/lib/app/agenda";
import { loadAgenda } from "@/lib/app/agenda-data";
import { loadEvaluationContext } from "@/lib/app/evaluation-data";
import { loadPresentationData, recordingDisabledReason } from "@/lib/app/presentation-data";
import { getSession } from "@/lib/app/session";
import { cardClass } from "@/lib/app/ui";

/**
 * Modo sala: todo lo que necesita el jurado durante las exposiciones en una
 * pantalla — turno y cronómetro, grabación, rúbrica, apoyo de la IA y notas.
 */
export default async function RoomPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string; slot?: string }>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const { supabase, user, event, canVote, isAdmin, role, recording, words } = session;
  if (!canVote) redirect("/agenda");
  const [t, tAgenda] = await Promise.all([getTranslations("room"), getTranslations("agenda")]);

  const agenda = await loadAgenda(supabase, event.id);
  const rooms = [...new Set(agenda.map((slot) => slot.room))];
  if (!rooms.length) {
    // Sin agenda la sala también sirve: se elige el grupo y se evalúa y graba.
    const { data: teams } = await supabase
      .from("teams")
      .select("id, number, name, project_title")
      .eq("event_id", event.id)
      .order("number");
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl tracking-tight sm:text-3xl">{t("pickTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("pickText")}</p>
        </div>
        {teams?.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => (
              <li key={team.id}>
                <Link
                  className={`${cardClass} flex h-full items-start gap-3 transition hover:-translate-y-0.5 hover:bg-muted`}
                  href={`/equipos/${team.id}/evaluar`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-muted-foreground">#{team.number}</span>
                    <span className="block font-display text-lg leading-tight">{team.name}</span>
                    {team.project_title ? (
                      <span className="mt-1 block text-sm text-muted-foreground">{team.project_title}</span>
                    ) : null}
                  </span>
                  <ArrowRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      <div className={`${cardClass} space-y-2`}>
        <h2 className="font-display text-lg">{t("noAgenda")}</h2>
        <p className="text-sm text-muted-foreground">
          {isAdmin ? (
            t.rich("createAgenda", {
              link: (chunks) => (
                <Link className="underline" href="/admin/agenda">
                  {chunks}
                </Link>
              ),
            })
          ) : (
            t("notReady")
          )}
        </p>
      </div>
      </div>
    );
  }

  const room = params.room && rooms.includes(params.room) ? params.room : rooms[0];
  const scheduled = scheduleRoom(agenda.filter((slot) => slot.room === room));
  const current =
    scheduled.find((slot) => slot.id === params.slot) ??
    scheduled.find((slot) => slot.status === "live") ??
    scheduled.find((slot) => slot.status === "pending") ??
    scheduled.at(-1)!;
  const next = scheduled.find((slot) => slot.position > current.position && slot.status === "pending");

  const [evaluation, presentations] = await Promise.all([
    loadEvaluationContext(session, current.team_id),
    loadPresentationData(supabase, event.id, current.team_id),
  ]);

  return (
    <div className="space-y-6">
      <AgendaLiveRefresh eventId={event.id} />

      <div className="flex flex-wrap items-center gap-2">
        {rooms.map((name) => (
          <Link
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${
              name === room ? "border-primary bg-primary/10" : "border-border"
            }`}
            href={`/sala?room=${encodeURIComponent(name)}`}
            key={name}
          >
            {name}
          </Link>
        ))}
      </div>

      <section className={`${cardClass} space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-muted-foreground">
              {room} · {tAgenda(`status.${current.status}`)}
              {current.expectedStart ? ` · ${t("expectedAt", { time: timeFormat.format(current.expectedStart) })}` : ""}
            </p>
            <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
              {words.unit} #{current.team.number} · {current.team.name}
            </h1>
          </div>
          {next ? (
            <Link
              className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
              href={`/sala?room=${encodeURIComponent(room)}&slot=${next.id}`}
            >
              {t("next", { name: next.team.name })} <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
        </div>
        <SlotControls
          durationMinutes={current.duration_minutes}
          slotId={current.id}
          startedAt={current.started_at}
          status={current.status}
        />
      </section>

      <PresentationStudio
        canCreate={role !== "viewer" && recording.enabled}
        canManage={isAdmin}
        initialRecords={presentations.records}
        juryReports={presentations.juryReports}
        recordingDisabledReason={await recordingDisabledReason(recording.enabled, isAdmin)}
        teamId={current.team_id}
        userId={user.id}
      />

      {evaluation.ok ? (
        <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
          <EvaluationForm
            canShareWithTeam={evaluation.hasStudents}
            criteria={evaluation.criteria}
            eventId={event.id}
            initial={evaluation.initial}
            key={current.team_id}
            locked={evaluation.locked}
            page={evaluation.page}
            rubricId={evaluation.rubric.id}
            scaleMax={evaluation.rubric.scale_max}
            teamId={current.team_id}
            userId={user.id}
          />
          <aside className="space-y-6">
            <div className={cardClass}>
              <AiEvidencePanel
                evidence={evaluation.aiEvidence}
                processing={evaluation.aiProcessing}
                teamId={current.team_id}
              />
            </div>
            <div>
              <h2 className="mb-3 font-display text-xl">{t("notes")}</h2>
              <NotesPanel
                eventId={event.id}
                initialNotes={evaluation.notes}
                key={current.team_id}
                teamId={current.team_id}
                userId={user.id}
              />
            </div>
          </aside>
        </div>
      ) : (
        <p className={cardClass}>{evaluation.message}</p>
      )}
    </div>
  );
}

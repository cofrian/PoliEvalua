import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";

import type { getSession } from "@/lib/app/session";
import { cardClass } from "@/lib/app/ui";

type Session = Awaited<ReturnType<typeof getSession>>;

type Step = { label: string; done: boolean; detail: string; href: string; optional?: boolean };

/**
 * Inicio de la gestión: qué falta por preparar y cómo va la evaluación, con un
 * enlace directo a cada cosa pendiente.
 */
export async function AdminOverview({ session }: { session: Session }) {
  const { supabase, event, recording, words } = session;
  const settings = (event.settings ?? {}) as { enabled_roles?: string[] };
  const hasStudents = (settings.enabled_roles ?? []).includes("student");

  const [
    { data: rubric },
    { data: teams },
    { data: members },
    { data: evaluations },
    { data: page },
    { count: panelCount },
    { count: slotCount },
    { data: recordings },
  ] = await Promise.all([
    supabase
      .from("rubrics")
      .select("rubric_criteria(weight, deleted_at)")
      .eq("event_id", event.id)
      .eq("is_active", true)
      .maybeSingle(),
    supabase.from("teams").select("id, name, number, team_members(user_id, email)").eq("event_id", event.id).order("number"),
    supabase
      .from("event_members")
      .select("user_id, role, recording_notice_version")
      .eq("event_id", event.id)
      .eq("status", "active"),
    supabase.from("evaluations").select("team_id, judge_id, status").eq("event_id", event.id),
    supabase.from("evaluation_pages").select("status, min_evaluations").eq("event_id", event.id).maybeSingle(),
    supabase.from("jury_panels").select("id", { count: "exact", head: true }).eq("event_id", event.id).eq("active", true),
    supabase.from("presentation_slots").select("id", { count: "exact", head: true }).eq("event_id", event.id),
    supabase.from("presentation_recordings").select("status").eq("event_id", event.id).is("deleted_at", null),
  ]);

  const criteria = ((rubric?.rubric_criteria ?? []) as { weight: number; deleted_at: string | null }[]).filter(
    (criterion) => !criterion.deleted_at,
  );
  const weightTotal = criteria.reduce((sum, criterion) => sum + Number(criterion.weight), 0);
  const teamList = (teams ?? []) as {
    id: string;
    name: string;
    number: number | null;
    team_members: { user_id: string | null; email: string | null }[];
  }[];
  const voters = (members ?? []).filter((member) => ["owner", "manager", "judge", "reviewer", "teacher"].includes(member.role));
  const evaluators = (members ?? []).filter((member) => ["judge", "reviewer", "teacher"].includes(member.role));
  const roster = teamList.flatMap((team) => team.team_members);
  const linked = roster.filter((member) => member.user_id).length;
  const pendingNotice = recording.enabled
    ? (members ?? []).filter((member) => (member.recording_notice_version ?? -1) < recording.noticeVersion).length
    : 0;

  const steps: Step[] = [
    {
      label: "Rúbrica",
      done: criteria.length > 0 && Math.round(weightTotal) === 100,
      detail: criteria.length
        ? `${criteria.length} criterios · pesos ${Math.round(weightTotal)} %`
        : "Sin criterios",
      href: "/rubrica",
    },
    {
      label: "Página de evaluación",
      done: page?.status === "published",
      detail: page?.status === "published" ? "Publicada" : page?.status === "closed" ? "Cerrada" : "En preparación",
      href: "/admin/evaluacion",
    },
    {
      label: words.units,
      done: teamList.length > 0 && teamList.every((team) => team.team_members.length > 0),
      detail: teamList.length
        ? `${teamList.length} · ${teamList.filter((team) => !team.team_members.length).length} sin integrantes`
        : "Ninguno todavía",
      href: "/admin/equipos",
    },
    ...(hasStudents
      ? [
          {
            label: "Alumnado con cuenta",
            done: roster.length > 0 && linked === roster.length,
            detail: roster.length ? `${linked}/${roster.length} han entrado con su correo` : "Sin lista de alumnado",
            href: "/admin/equipos",
          },
        ]
      : []),
    {
      label: words.evaluator.charAt(0).toUpperCase() + words.evaluator.slice(1),
      done: evaluators.length > 0,
      detail: `${evaluators.length} personas · ${panelCount ?? 0} paneles`,
      href: "/admin",
    },
    {
      label: "Agenda",
      done: (slotCount ?? 0) > 0,
      detail: slotCount ? `${slotCount} turnos` : "Sin agenda",
      href: "/admin/agenda",
      optional: true,
    },
    {
      label: "Aviso de grabación",
      done: recording.enabled && pendingNotice === 0,
      detail: recording.enabled
        ? pendingNotice
          ? `${pendingNotice} personas aún no lo han confirmado`
          : "Todos lo han confirmado"
        : "Grabación desactivada",
      href: "/admin/grabaciones",
      optional: true,
    },
  ];

  const submitted = (evaluations ?? []).filter((evaluation) => evaluation.status === "submitted");
  const minimum = page?.min_evaluations ?? 1;
  const byTeam = teamList.map((team) => ({
    ...team,
    submitted: submitted.filter((evaluation) => evaluation.team_id === team.id).length,
    drafts: (evaluations ?? []).filter((evaluation) => evaluation.team_id === team.id && evaluation.status !== "submitted").length,
  }));
  const behind = byTeam.filter((team) => team.submitted < minimum);
  const perJudge = voters
    .map((voter) => ({
      id: voter.user_id,
      count: submitted.filter((evaluation) => evaluation.judge_id === voter.user_id).length,
    }))
    .filter((voter) => evaluators.some((evaluator) => evaluator.user_id === voter.id));
  const recordingCounts = {
    processing: (recordings ?? []).filter((item) =>
      ["uploading", "queued", "transcribing", "transcribed", "analyzing"].includes(item.status),
    ).length,
    failed: (recordings ?? []).filter((item) => item.status === "failed").length,
    ready: (recordings ?? []).filter((item) => item.status === "ready").length,
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className={cardClass}>
        <h2 className="mb-3 font-display text-2xl">Preparación</h2>
        <ul className="space-y-2">
          {steps.map((step) => (
            <li key={step.label}>
              <Link className="flex items-start gap-3 rounded-lg p-2 hover:bg-muted" href={step.href}>
                {step.done ? (
                  <CheckCircle2 aria-label="Hecho" className="mt-0.5 size-5 shrink-0 text-leaf-500" />
                ) : (
                  <Circle aria-label="Pendiente" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                )}
                <span>
                  <strong className="block text-sm">
                    {step.label}
                    {step.optional ? <span className="font-normal text-muted-foreground"> · opcional</span> : null}
                  </strong>
                  <span className="text-sm text-muted-foreground">{step.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${cardClass} space-y-4`}>
        <h2 className="font-display text-2xl">Evaluación</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-muted p-3">
            <p className="text-2xl font-bold">{submitted.length}</p>
            <p className="text-xs text-muted-foreground">enviadas</p>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <p className="text-2xl font-bold">{teamList.length - behind.length}/{teamList.length}</p>
            <p className="text-xs text-muted-foreground">{words.unitsLower} con ≥ {minimum}</p>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <p className="text-2xl font-bold">{perJudge.filter((judge) => judge.count === 0).length}</p>
            <p className="text-xs text-muted-foreground">evaluadores sin empezar</p>
          </div>
        </div>
        {behind.length && teamList.length ? (
          <div>
            <p className="mb-1 text-sm font-semibold">Les faltan evaluaciones</p>
            <ul className="flex flex-wrap gap-2 text-sm">
              {behind.slice(0, 24).map((team) => (
                <li key={team.id}>
                  <Link className="rounded-full border border-line px-2.5 py-0.5 hover:bg-muted dark:border-[#262838]" href={`/equipos/${team.id}`}>
                    #{team.number} {team.name} · {team.submitted}/{minimum}
                    {team.drafts ? ` (+${team.drafts} borrador)` : ""}
                  </Link>
                </li>
              ))}
              {behind.length > 24 ? <li className="text-muted-foreground">… y {behind.length - 24} más</li> : null}
            </ul>
          </div>
        ) : null}
        {recording.enabled ? (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span>Grabaciones: {recordingCounts.ready} listas · {recordingCounts.processing} en proceso</span>
            {recordingCounts.failed ? (
              <span className="flex items-center gap-1 font-semibold text-destructive">
                <AlertTriangle aria-hidden="true" className="size-4" /> {recordingCounts.failed} requieren atención
              </span>
            ) : null}
          </p>
        ) : null}
        <Link className="inline-block text-sm font-semibold underline" href="/resultados">
          Ver resultados
        </Link>
      </section>
    </div>
  );
}

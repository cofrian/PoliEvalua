import { CalendarClock, ClipboardList, Mic2, Users } from "lucide-react";
import Link from "next/link";

import { AgendaLiveRefresh } from "@/components/app/agenda-live-refresh";
import { TeamLinks, type TeamLink } from "@/components/app/team-links";
import { scheduleRoom, slotStatusLabels, timeFormat } from "@/lib/app/agenda";
import { loadAgenda } from "@/lib/app/agenda-data";
import { getSession } from "@/lib/app/session";
import { cardClass } from "@/lib/app/ui";

/** Punto de partida del alumnado: su grupo, sus entregas y lo que necesita saber. */
export default async function MyGroupPage() {
  const { supabase, user, event, words, recording, eventClosed } = await getSession();

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
        <h1 className="font-display text-2xl">Todavía no tienes {words.unitLower}</h1>
        <p className="text-sm text-muted-foreground">
          Cuando la gestión del espacio te añada con tu correo, aparecerá aquí. Si ya lo ha hecho,
          comprueba que has entrado con ese mismo correo.
        </p>
      </div>
    );
  }

  const links = [...team.team_links].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const agenda = await loadAgenda(supabase, event.id);
  const mySlot = agenda.find((slot) => slot.team_id === team.id);
  const myScheduled = mySlot
    ? scheduleRoom(agenda.filter((slot) => slot.room === mySlot.room)).find((slot) => slot.id === mySlot.id)
    : null;

  return (
    <div className="space-y-6">
      {mySlot ? <AgendaLiveRefresh eventId={event.id} /> : null}
      <header>
        <p className="text-sm font-bold text-muted-foreground">
          Mi {words.unitLower} · #{team.number}
        </p>
        <h1 className="font-display text-3xl sm:text-4xl">{team.name}</h1>
        {team.project_title ? <p className="mt-1 text-lg">{team.project_title}</p> : null}
      </header>

      {myScheduled ? (
        <Link
          className={`${cardClass} flex flex-wrap items-center gap-x-6 gap-y-1 hover:bg-muted ${
            myScheduled.status === "live" ? "border-destructive" : ""
          }`}
          href="/agenda"
        >
          <span className="flex items-center gap-2 font-semibold">
            <CalendarClock aria-hidden="true" className="size-5 text-primary" /> Tu turno
          </span>
          <span className="font-mono text-2xl font-bold">
            {myScheduled.status === "live"
              ? "¡Ahora!"
              : myScheduled.expectedStart
                ? timeFormat.format(myScheduled.expectedStart)
                : "Por confirmar"}
          </span>
          <span className="text-sm text-muted-foreground">
            {myScheduled.room} · {myScheduled.duration_minutes} min · {slotStatusLabels[myScheduled.status]}
            {myScheduled.delayMinutes && myScheduled.status === "pending"
              ? ` · ${myScheduled.delayMinutes} min de retraso`
              : ""}
          </span>
        </Link>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <section className={cardClass}>
          <h2 className="mb-2 flex items-center gap-2 font-display text-lg">
            <Users aria-hidden="true" className="size-4" /> Integrantes
          </h2>
          <ul className="space-y-1 text-sm">
            {team.team_members.map((member) => (
              <li key={member.id}>
                {member.full_name}
                {member.user_id === user.id ? " (tú)" : ""}
              </li>
            ))}
          </ul>
        </section>

        <section className={cardClass}>
          <h2 className="mb-2 font-display text-lg">Entregas</h2>
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

      <div className="grid gap-4 sm:grid-cols-2">
        {words.studentsSeeRubric && words.hasModule("rubric") ? (
          <Link className={`${cardClass} flex items-start gap-3 hover:bg-muted`} href="/rubrica">
            <ClipboardList aria-hidden="true" className="mt-0.5 size-5 text-primary" />
            <span>
              <strong className="block">Cómo te evaluarán</strong>
              <span className="text-sm text-muted-foreground">
                Criterios, pesos y lo que se espera en cada nivel.
              </span>
            </span>
          </Link>
        ) : null}
        {recording.enabled ? (
          <Link className={`${cardClass} flex items-start gap-3 hover:bg-muted`} href={`/equipos/${team.id}/presentaciones`}>
            <Mic2 aria-hidden="true" className="mt-0.5 size-5 text-primary" />
            <span>
              <strong className="block">Tu {words.presentation}</strong>
              <span className="text-sm text-muted-foreground">
                Se grabará y transcribirá; el audio no se guarda. Aquí verás el texto y el resumen cuando estén compartidos.
              </span>
            </span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

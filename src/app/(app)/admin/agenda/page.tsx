import { clearAgendaAction } from "@/app/(app)/admin/actions";
import { AgendaBoard } from "@/components/app/agenda-board";
import { AgendaGenerator } from "@/components/app/agenda-generator";
import { Button } from "@/components/ui/button";
import { loadAgenda } from "@/lib/app/agenda-data";
import { getSession } from "@/lib/app/session";
import { cardClass } from "@/lib/app/ui";

/** Mañana a las 9:00, como sugerencia para el primer turno. */
function suggestedStart() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(date);
  return `${day}T09:00`;
}

export default async function AdminAgendaPage() {
  const { supabase, event, words } = await getSession();
  const slots = await loadAgenda(supabase, event.id);

  return (
    <div className="space-y-8">
      <section className={cardClass}>
        <h2 className="mb-2 font-display text-2xl">Agenda de {words.presentation === "exposición" ? "exposiciones" : "defensas"}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Reparte los {words.unitsLower} entre las salas y calcula la hora de cada turno. Todo el espacio
          ve la agenda; el alumnado ve resaltado su turno y los retrasos se recalculan solos.
        </p>
        <AgendaGenerator defaultStart={suggestedStart()} hasAgenda={slots.length > 0} />
      </section>

      {slots.length ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl">Turnos</h2>
            <form action={clearAgendaAction}>
              <Button className="h-9 text-destructive" type="submit" variant="ghost">
                Borrar agenda
              </Button>
            </form>
          </div>
          <AgendaBoard canReorder canRunRoom slots={slots} />
        </section>
      ) : null}
    </div>
  );
}

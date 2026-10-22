import { CalendarDays } from "lucide-react";

import { clearAgendaAction } from "@/app/(app)/admin/actions";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { AgendaBoard } from "@/components/app/agenda-board";
import { AgendaGenerator } from "@/components/app/agenda-generator";
import { ConfirmSubmit } from "@/components/app/confirm-submit";
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
    <div className="space-y-6">
      <PageHeader
        description="Turnos de exposición, salas y orden. El jurado y el alumnado la ven al momento."
        title="Organizar agenda"
      />
      <section className={cardClass}>
        <h2 className="mb-2 font-display text-lg">{slots.length ? "Rehacer la agenda" : "Generar la agenda"}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Reparte los {words.unitsLower} entre las salas y calcula la hora de cada turno. Todo el espacio
          ve la agenda; el alumnado ve resaltado su turno y los retrasos se recalculan solos.
        </p>
        <AgendaGenerator defaultStart={suggestedStart()} hasAgenda={slots.length > 0} />
      </section>

      {slots.length ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg">Turnos ({slots.length})</h2>
            <form action={clearAgendaAction}>
              <ConfirmSubmit
                confirmLabel="Borrar agenda"
                description="Se eliminan todos los turnos. Las evaluaciones y grabaciones no se tocan."
                title="¿Borrar toda la agenda?"
              >
                Borrar agenda
              </ConfirmSubmit>
            </form>
          </div>
          <AgendaBoard canReorder canRunRoom slots={slots} />
        </section>
      ) : (
        <EmptyState
          description={`Elige salas, duración y hora de inicio arriba y se repartirán los ${words.unitsLower} en turnos. Después podrás reordenarlos arrastrando.`}
          icon={<CalendarDays aria-hidden="true" />}
          title="Aún no hay turnos"
        />
      )}
    </div>
  );
}

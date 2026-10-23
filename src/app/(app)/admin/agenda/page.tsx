import { CalendarDays } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/app/action-form";
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
  const [slots, t] = await Promise.all([loadAgenda(supabase, event.id), getTranslations("agendaAdmin")]);

  return (
    <div className="space-y-6">
      <PageHeader
        description={t("description")}
        title={t("title")}
      />
      <section className={cardClass}>
        <h2 className="mb-2 font-display text-lg">{slots.length ? t("redo") : t("generate")}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("text", { units: words.unitsLower })}
        </p>
        <AgendaGenerator defaultStart={suggestedStart()} hasAgenda={slots.length > 0} />
      </section>

      {slots.length ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg">{t("slots", { count: slots.length })}</h2>
            <ActionForm action={clearAgendaAction}>
              <ConfirmSubmit
                confirmLabel={t("clear")}
                description={t("clearText")}
                title={t("clearTitle")}
              >
                {t("clear")}
              </ConfirmSubmit>
            </ActionForm>
          </div>
          <AgendaBoard canReorder canRunRoom slots={slots} />
        </section>
      ) : (
        <EmptyState
          description={t("emptyText", { units: words.unitsLower })}
          icon={<CalendarDays aria-hidden="true" />}
          title={t("emptyTitle")}
        />
      )}
    </div>
  );
}

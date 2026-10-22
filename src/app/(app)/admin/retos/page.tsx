import { deleteChallengeAction, saveChallengeAction } from "@/app/(app)/admin/actions";
import { PageHeader } from "@/components/app/page-header";
import { ConfirmSubmit } from "@/components/app/confirm-submit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSession } from "@/lib/app/session";
import { cardClass } from "@/lib/app/ui";

type Challenge = {
  id: string;
  name: string;
  description: string | null;
  order: number | null;
};

function ChallengeForm({ challenge }: { challenge: Challenge | null }) {
  return (
    <form action={saveChallengeAction} className="grid gap-3 sm:grid-cols-[6rem_1fr_2fr_auto] sm:items-end">
      <input name="id" type="hidden" value={challenge?.id ?? ""} />
      <label className="space-y-1 text-sm font-semibold">
        <span className="block">Orden</span>
        <Input defaultValue={challenge?.order ?? ""} inputMode="numeric" name="order" />
      </label>
      <label className="space-y-1 text-sm font-semibold">
        <span className="block">Nombre</span>
        <Input defaultValue={challenge?.name ?? ""} name="name" required />
      </label>
      <label className="space-y-1 text-sm font-semibold">
        <span className="block">Descripción</span>
        <Input defaultValue={challenge?.description ?? ""} name="description" />
      </label>
      <Button type="submit">{challenge ? "Guardar" : "Crear reto"}</Button>
    </form>
  );
}

export default async function AdminChallengesPage() {
  const { supabase, event } = await getSession();
  const [{ data: challenges }, { data: teams }] = await Promise.all([
    supabase.from("challenges").select("id, name, description, order").eq("event_id", event.id).order("order"),
    supabase.from("teams").select("challenge_id").eq("event_id", event.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        description="Las categorías en las que compiten los equipos."
        title="Retos"
      />
    <div className="space-y-4">
      {(challenges ?? []).map((challenge) => {
        const count = (teams ?? []).filter((t) => t.challenge_id === challenge.id).length;
        return (
          <section className={cardClass} key={challenge.id}>
            <ChallengeForm challenge={challenge} />
            <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
              <span>{count} equipos</span>
              {count === 0 ? (
                <form action={deleteChallengeAction}>
                  <input name="id" type="hidden" value={challenge.id} />
                  <ConfirmSubmit confirmLabel="Borrar reto" title={`¿Borrar «${challenge.name}»?`}>
                    Borrar reto
                  </ConfirmSubmit>
                </form>
              ) : null}
            </div>
          </section>
        );
      })}
      <section className={cardClass}>
        <h2 className="mb-3 font-display text-xl">Nuevo reto</h2>
        <ChallengeForm challenge={null} />
      </section>
    </div>
    </div>
  );
}

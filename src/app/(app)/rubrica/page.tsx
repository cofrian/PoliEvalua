import { Presence } from "@/components/app/presence";
import {
  RubricEditor,
  type EditableCriterion,
} from "@/components/app/rubric-editor";
import { RubricLiveUpdates } from "@/components/app/rubric-live-updates";
import { getSession } from "@/lib/app/session";

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function RubricPage() {
  const { supabase, user, profile, canVote, isAdmin, event } = await getSession();

  const { data: rubric } = await supabase
    .from("rubrics")
    .select(
      "id, name, locked, version, scale_min, scale_max, rubric_criteria(id, title, description, weight, order, deleted_at, updated_at, rubric_levels(id, score, label, descriptor))",
    )
    .eq("is_active", true)
    .eq("event_id", event?.id ?? "")
    .limit(1)
    .maybeSingle();

  if (!rubric) {
    return <p>No hay ninguna rúbrica activa.</p>;
  }

  const { data: changes } = await supabase
    .from("rubric_changes")
    .select("id, summary, created_at, author:profiles(full_name)")
    .eq("rubric_id", rubric.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const criteria = (
    (rubric.rubric_criteria ?? []) as unknown as (EditableCriterion & {
      deleted_at: string | null;
    })[]
  )
    .filter((criterion) => !criterion.deleted_at)
    .sort((a, b) => a.order - b.order)
    .map((criterion) => ({
      ...criterion,
      weight: Number(criterion.weight),
      rubric_levels: [...criterion.rubric_levels].sort(
        (a, b) => a.score - b.score,
      ),
    }));

  const canEdit = isAdmin || (canVote && !rubric.locked);

  return (
    <div className="space-y-8">
      <RubricLiveUpdates rubricId={rubric.id} userId={user.id} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">Rúbrica</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rubric.name} · versión {rubric.version} · escala{" "}
            {rubric.scale_min}–{rubric.scale_max}
            {rubric.locked ? " · 🔒 Bloqueada" : ""}
          </p>
        </div>
        <Presence
          me={{
            id: user.id,
            name: profile.full_name,
            avatar: profile.avatar_url,
          }}
          room={`rubric-${rubric.id}`}
        />
      </div>

      {!canEdit ? (
        <p className="rounded-lg border border-line bg-white px-3 py-2.5 text-sm dark:border-[#262838] dark:bg-[#151621]">
          {canVote
            ? "La rúbrica está bloqueada: solo el admin puede cambiarla."
            : "Como mentor puedes consultar la rúbrica, pero no editarla."}
        </p>
      ) : null}

      <RubricEditor
        canEdit={canEdit}
        initialCriteria={criteria}
        isAdmin={isAdmin}
        locked={rubric.locked}
        rubricId={rubric.id}
        userId={user.id}
      />

      <section>
        <h2 className="mb-3 font-display text-2xl">Historial de cambios</h2>
        {changes?.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line bg-white text-sm dark:divide-[#262838] dark:border-[#262838] dark:bg-[#151621]">
            {changes.map((change) => (
              <li className="flex flex-wrap justify-between gap-2 px-3 py-2" key={change.id}>
                <span>
                  <strong>
                    {(change.author as unknown as { full_name: string } | null)
                      ?.full_name ?? "Alguien"}
                  </strong>{" "}
                  {change.summary}
                </span>
                <span className="text-muted-foreground">
                  {dateFormat.format(new Date(change.created_at))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Todavía no se ha cambiado nada.
          </p>
        )}
      </section>
    </div>
  );
}

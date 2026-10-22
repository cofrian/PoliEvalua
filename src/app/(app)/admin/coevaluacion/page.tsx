import { updatePeerReviewSettingsAction } from "@/app/(app)/admin/actions";
import { PageHeader } from "@/components/app/page-header";
import { PeerAssignButton } from "@/components/app/peer-assign-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { peerReviewSettings } from "@/lib/app/peer-review";
import { getSession } from "@/lib/app/session";
import { cardClass } from "@/lib/app/ui";

export default async function PeerReviewAdminPage() {
  const { supabase, event, words } = await getSession();
  const settings = peerReviewSettings(event.settings);

  const [{ data: members }, { data: assignments }, { data: reviews }, { data: contributions }] = await Promise.all([
    supabase
      .from("team_members")
      .select("id, full_name, user_id, team:teams(name)")
      .eq("event_id", event.id)
      .order("full_name"),
    supabase.from("peer_assignments").select("reviewer_id").eq("event_id", event.id),
    supabase.from("peer_reviews").select("reviewer_id, kind, status").eq("event_id", event.id),
    supabase.from("contribution_reviews").select("reviewer_id").eq("event_id", event.id),
  ]);

  const rows = (members ?? []).map((member) => {
    const relation = member.team as unknown as { name: string } | { name: string }[] | null;
    const team = Array.isArray(relation) ? relation[0] : relation;
    const mine = (reviews ?? []).filter((review) => review.reviewer_id === member.user_id);
    return {
      id: member.id,
      name: member.full_name,
      team: team?.name ?? "",
      linked: Boolean(member.user_id),
      assigned: (assignments ?? []).filter((item) => item.reviewer_id === member.user_id).length,
      peerDone: mine.filter((review) => review.kind === "peer" && review.status === "submitted").length,
      selfDone: mine.some((review) => review.kind === "self" && review.status === "submitted"),
      contributions: (contributions ?? []).filter((item) => item.reviewer_id === member.user_id).length,
    };
  });
  const weightSum = settings.weights.teacher + settings.weights.peer + settings.weights.self;

  return (
    <div className="space-y-6">
      <PageHeader
        description="Que el alumnado se evalúe entre sí y a sí mismo, con reparto automático."
        title="Coevaluación"
      />
    <div className="space-y-8">
      <section className={cardClass}>
        <h2 className="mb-2 font-display text-xl">Coevaluación y autoevaluación</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          El alumnado evalúa con la misma rúbrica a otros {words.unitsLower} y, si lo activas, al suyo. También
          puede valorar de 1 a 5 lo que ha aportado cada compañero. Nadie ve las respuestas individuales de otros.
        </p>
        <form action={updatePeerReviewSettingsAction} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["enabled", "Activar la coevaluación en este espacio", settings.enabled],
              ["peer", `Evaluar a otros ${words.unitsLower}`, settings.peer],
              ["self", `Autoevaluación del propio ${words.unitLower}`, settings.self],
              ["contribution", "Valorar la aportación de cada compañero", settings.contribution],
              ["anonymous", "Comentarios anónimos para quien los recibe", settings.anonymous],
            ].map(([name, label, checked]) => (
              <label className="flex items-center gap-3 rounded-lg border border-input p-3 text-sm font-semibold" key={name as string}>
                <input defaultChecked={checked as boolean} name={name as string} type="checkbox" />
                {label as string}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <label className="space-y-1 text-sm font-semibold">
              <span className="block">{words.units} que evalúa cada estudiante</span>
              <Input className="h-9 w-24" defaultValue={settings.reviewsPerStudent} max={10} min={1} name="reviewsPerStudent" type="number" />
            </label>
            <fieldset className="flex flex-wrap items-end gap-3">
              <legend className="mb-1 text-sm font-semibold">Peso en la nota final (%)</legend>
              <label className="space-y-1 text-xs">
                <span className="block">{words.evaluator}</span>
                <Input className="h-9 w-20" defaultValue={settings.weights.teacher} max={100} min={0} name="weightTeacher" type="number" />
              </label>
              <label className="space-y-1 text-xs">
                <span className="block">compañeros</span>
                <Input className="h-9 w-20" defaultValue={settings.weights.peer} max={100} min={0} name="weightPeer" type="number" />
              </label>
              <label className="space-y-1 text-xs">
                <span className="block">autoevaluación</span>
                <Input className="h-9 w-20" defaultValue={settings.weights.self} max={100} min={0} name="weightSelf" type="number" />
              </label>
            </fieldset>
          </div>
          {weightSum !== 100 ? (
            <p className="text-sm text-orange-600 dark:text-orange-400">
              Los pesos suman {weightSum} %: se reparten en proporción. Si falta una parte (nadie se autoevaluó), su peso pasa a las demás.
            </p>
          ) : null}
          <Button type="submit">Guardar</Button>
        </form>
      </section>

      {settings.enabled && settings.peer ? (
        <section className={cardClass}>
          <h2 className="mb-2 font-display text-xl">Reparto</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Asigna a cada estudiante con cuenta {settings.reviewsPerStudent} {words.unitsLower} que no son el suyo, equilibrando cuántas
            revisiones recibe cada uno. Repartir de nuevo no borra lo ya evaluado.
          </p>
          <PeerAssignButton hasAssignments={(assignments ?? []).length > 0} />
        </section>
      ) : null}

      {settings.enabled ? (
        <section>
          <h2 className="mb-3 font-display text-xl">Progreso</h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Estudiante</th>
                  <th className="px-3 py-2">{words.unit}</th>
                  {settings.peer ? <th className="px-3 py-2 text-right">Coevaluación</th> : null}
                  {settings.self ? <th className="px-3 py-2 text-right">Autoevaluación</th> : null}
                  {settings.contribution ? <th className="px-3 py-2 text-right">Aportación</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-b border-border last:border-0" key={row.id}>
                    <td className="px-3 py-2 font-semibold">
                      {row.name}
                      {!row.linked ? <span className="block text-xs font-normal text-muted-foreground">Aún no ha entrado</span> : null}
                    </td>
                    <td className="px-3 py-2">{row.team}</td>
                    {settings.peer ? <td className="px-3 py-2 text-right">{row.peerDone}/{row.assigned}</td> : null}
                    {settings.self ? <td className="px-3 py-2 text-right">{row.selfDone ? "✔" : "—"}</td> : null}
                    {settings.contribution ? <td className="px-3 py-2 text-right">{row.contributions}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
    </div>
  );
}

import { saveEvaluationSettingsAction } from "@/app/(app)/admin/evaluacion/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getSession } from "@/lib/app/session";
import { cardClass, selectClass } from "@/lib/app/ui";

type Requirement = { label?: string };
type Question = { label?: string };

function localDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export default async function EvaluationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ applied?: string }>;
}) {
  const { applied } = await searchParams;
  const { supabase, event } = await getSession();
  const { data: page } = await supabase
    .from("evaluation_pages")
    .select("title, description, instructions, requirements, questions, status, aggregation_method, min_evaluations, current_round, opens_at, closes_at, version")
    .eq("event_id", event.id)
    .maybeSingle();
  const requirements = (page?.requirements ?? []) as Requirement[];
  const questions = (page?.questions ?? []) as Question[];

  return (
    <div className="space-y-5">
      {applied ? (
        <p className="rounded-lg border border-leaf-500/50 bg-leaf-500/10 p-3 text-sm">
          La propuesta se ha aplicado como borrador. Revísala y publícala cuando esté lista.
        </p>
      ) : null}
      <section className={cardClass}>
        <div className="mb-5">
          <h2 className="font-display text-2xl">Página de evaluación</h2>
          <p className="text-sm text-muted-foreground">Define lo que verá el jurado antes y durante la puntuación.</p>
        </div>
        <form action={saveEvaluationSettingsAction} className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold sm:col-span-2">
            <span className="block">Nombre</span>
            <Input defaultValue={page?.title ?? `Evaluación · ${event.name}`} name="title" required />
          </label>
          <label className="space-y-1 text-sm font-semibold sm:col-span-2">
            <span className="block">Descripción</span>
            <Textarea defaultValue={page?.description ?? ""} maxLength={2000} name="description" />
          </label>
          <label className="space-y-1 text-sm font-semibold sm:col-span-2">
            <span className="block">Instrucciones para evaluar</span>
            <Textarea className="min-h-28" defaultValue={page?.instructions ?? ""} maxLength={4000} name="instructions" />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            <span className="block">Estado</span>
            <select className={`${selectClass} w-full`} defaultValue={page?.status ?? "draft"} name="status">
              <option value="draft">Borrador</option>
              <option value="published">Publicada</option>
              <option value="closed">Cerrada</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold">
            <span className="block">Cálculo del panel</span>
            <select className={`${selectClass} w-full`} defaultValue={page?.aggregation_method ?? "average"} name="aggregationMethod">
              <option value="average">Media individual</option>
              <option value="consensus">Media por panel (cada panel pesa igual)</option>
              <option value="hybrid">Media individual + media por panel</option>
              <option value="trimmed_mean">Media sin extremos</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold">
            <span className="block">Evaluaciones mínimas por proyecto</span>
            <Input defaultValue={page?.min_evaluations ?? 1} max={20} min={1} name="minEvaluations" type="number" />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            <span className="block">Ronda activa</span>
            <Input defaultValue={page?.current_round ?? 1} max={20} min={1} name="currentRound" type="number" />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            <span className="block">Apertura</span>
            <Input defaultValue={localDateTime(page?.opens_at)} name="opensAt" type="datetime-local" />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            <span className="block">Cierre</span>
            <Input defaultValue={localDateTime(page?.closes_at)} name="closesAt" type="datetime-local" />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            <span className="block">Requisitos obligatorios, uno por línea</span>
            <Textarea className="min-h-32" defaultValue={requirements.map((item) => item.label).filter(Boolean).join("\n")} name="requirements" />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            <span className="block">Preguntas adicionales, una por línea</span>
            <Textarea className="min-h-32" defaultValue={questions.map((item) => item.label).filter(Boolean).join("\n")} name="questions" />
          </label>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <span className="text-xs text-muted-foreground">Versión {page?.version ?? 1}</span>
            <Button type="submit">Guardar configuración</Button>
          </div>
        </form>
      </section>
    </div>
  );
}


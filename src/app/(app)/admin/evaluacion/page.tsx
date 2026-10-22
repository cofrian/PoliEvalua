import { saveEvaluationSettingsAction } from "@/app/(app)/admin/evaluacion/actions";
import { PageHeader } from "@/components/app/page-header";
import { SettingRow, SettingsForm } from "@/components/app/settings-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getSession } from "@/lib/app/session";
import { selectClass } from "@/lib/app/ui";

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
    <div className="space-y-6">
      <PageHeader
        description="Cuándo se abre la evaluación, cuántas opiniones hacen falta y cómo se calcula la nota."
        title="Evaluación"
      />
      {applied ? (
        <p className="rounded-lg border border-leaf-500/50 bg-leaf-500/10 p-3 text-sm">
          La propuesta se ha aplicado como borrador. Revísala y publícala cuando esté lista.
        </p>
      ) : null}
      <SettingsForm
        action={saveEvaluationSettingsAction}
        description={`Versión ${page?.version ?? 1}. Mientras esté en borrador, nadie puede evaluar.`}
        title="Página de evaluación"
      >
        <SettingRow
          description="Publícala para que el jurado pueda puntuar. Al cerrarla, nadie puede modificar evaluaciones."
          htmlFor="status"
          label="Estado"
        >
          <select className={`${selectClass} w-full`} defaultValue={page?.status ?? "draft"} id="status" name="status">
            <option value="draft">Borrador</option>
            <option value="published">Publicada</option>
            <option value="closed">Cerrada</option>
          </select>
        </SettingRow>
        <SettingRow description="Opcional. Se abre y se cierra sola en estas fechas." label="Apertura y cierre">
          <div className="grid gap-2">
            <Input aria-label="Apertura" defaultValue={localDateTime(page?.opens_at)} name="opensAt" type="datetime-local" />
            <Input aria-label="Cierre" defaultValue={localDateTime(page?.closes_at)} name="closesAt" type="datetime-local" />
          </div>
        </SettingRow>
        <SettingRow description="Las rondas sirven para repartir paneles en varias tandas." htmlFor="currentRound" label="Ronda activa">
          <Input className="sm:ml-auto sm:w-24" defaultValue={page?.current_round ?? 1} id="currentRound" max={20} min={1} name="currentRound" type="number" />
        </SettingRow>
        <SettingRow description="Cómo se combinan las puntuaciones de varias personas." htmlFor="aggregationMethod" label="Cálculo de la nota">
          <select className={`${selectClass} w-full`} defaultValue={page?.aggregation_method ?? "average"} id="aggregationMethod" name="aggregationMethod">
            <option value="average">Media individual</option>
            <option value="consensus">Media por panel (cada panel pesa igual)</option>
            <option value="hybrid">Media individual + media por panel</option>
            <option value="trimmed_mean">Media sin extremos</option>
          </select>
        </SettingRow>
        <SettingRow description="Por debajo de este número, el Resumen lo marca como pendiente." htmlFor="minEvaluations" label="Evaluaciones mínimas por proyecto">
          <Input className="sm:ml-auto sm:w-24" defaultValue={page?.min_evaluations ?? 1} id="minEvaluations" max={20} min={1} name="minEvaluations" type="number" />
        </SettingRow>
        <SettingRow htmlFor="title" label="Nombre" stacked>
          <Input defaultValue={page?.title ?? `Evaluación · ${event.name}`} id="title" name="title" required />
        </SettingRow>
        <SettingRow htmlFor="description" label="Descripción" stacked>
          <Textarea defaultValue={page?.description ?? ""} id="description" maxLength={2000} name="description" />
        </SettingRow>
        <SettingRow htmlFor="instructions" label="Instrucciones para evaluar" stacked>
          <Textarea className="min-h-28" defaultValue={page?.instructions ?? ""} id="instructions" maxLength={4000} name="instructions" />
        </SettingRow>
        <SettingRow description="Uno por línea. El jurado debe marcarlos antes de enviar." htmlFor="requirements" label="Requisitos obligatorios" stacked>
          <Textarea className="min-h-28" defaultValue={requirements.map((item) => item.label).filter(Boolean).join("\n")} id="requirements" name="requirements" />
        </SettingRow>
        <SettingRow description="Una por línea. Se responden con texto libre." htmlFor="questions" label="Preguntas adicionales" stacked>
          <Textarea className="min-h-28" defaultValue={questions.map((item) => item.label).filter(Boolean).join("\n")} id="questions" name="questions" />
        </SettingRow>
      </SettingsForm>
    </div>
  );
}

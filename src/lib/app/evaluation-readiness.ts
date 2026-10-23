import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type EvaluationReadiness = {
  criteria: number;
  weightTotal: number;
  /** La rúbrica tiene criterios y sus pesos suman 100. */
  rubricReady: boolean;
  pageStatus: "draft" | "published" | "closed";
  /** Se puede evaluar ahora mismo. */
  open: boolean;
};

/**
 * ¿Está lista la evaluación? Lo usan el Resumen, la publicación de la página y
 * el botón «Evaluar», para no llevar a nadie a una pantalla sin salida.
 */
export async function evaluationReadiness(supabase: SupabaseClient, eventId: string): Promise<EvaluationReadiness> {
  const [{ data: rubric }, { data: page }] = await Promise.all([
    supabase
      .from("rubrics")
      .select("rubric_criteria(weight, deleted_at)")
      .eq("event_id", eventId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase.from("evaluation_pages").select("status").eq("event_id", eventId).maybeSingle(),
  ]);
  const criteria = ((rubric?.rubric_criteria ?? []) as { weight: number; deleted_at: string | null }[]).filter(
    (criterion) => !criterion.deleted_at,
  );
  const weightTotal = Math.round(criteria.reduce((sum, criterion) => sum + Number(criterion.weight), 0));
  const rubricReady = criteria.length > 0 && weightTotal === 100;
  const pageStatus = (page?.status ?? "draft") as EvaluationReadiness["pageStatus"];
  return { criteria: criteria.length, weightTotal, rubricReady, pageStatus, open: rubricReady && pageStatus === "published" };
}

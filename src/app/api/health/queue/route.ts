import { NextResponse } from "next/server";

import { isCronRequest, sweepQueue } from "@/lib/app/processing-queue";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ventana del aviso: algo más que el intervalo del workflow «Vigilancia». */
const RECENT_MINUTES = 20;
/** Un trabajo pendiente más tiempo que esto está atascado. */
const STUCK_MINUTES = 90;

/**
 * Estado de la cola de grabaciones. Protegido con JOBS_CRON_SECRET; lo consulta
 * el workflow «Vigilancia» de GitHub, que falla (y GitHub avisa por correo) si
 * hay grabaciones fallidas recientes o trabajos atascados.
 */
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const admin = createAdminClient();
  // Sin trabajos internos pg_cron no llama a la app: la limpieza también corre aquí.
  await sweepQueue(admin);

  const now = Date.now();
  const recent = new Date(now - RECENT_MINUTES * 60_000).toISOString();
  const stuckBefore = new Date(now - STUCK_MINUTES * 60_000).toISOString();
  const [failed, stuck, pending] = await Promise.all([
    admin
      .from("presentation_recordings")
      .select("id, error_message, updated_at")
      .eq("status", "failed")
      .gte("updated_at", recent)
      .limit(20),
    admin
      .from("processing_jobs")
      .select("id, kind, runner, status, attempts, last_error, created_at")
      .in("status", ["queued", "processing"])
      .lt("created_at", stuckBefore)
      .limit(20),
    admin
      .from("processing_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["queued", "processing"]),
  ]);
  const queryError = failed.error ?? stuck.error ?? pending.error;
  if (queryError) {
    return NextResponse.json({ ok: false, error: queryError.message }, { status: 503 });
  }

  const failedRecently = failed.data ?? [];
  const stuckJobs = stuck.data ?? [];
  const ok = !failedRecently.length && !stuckJobs.length;
  return NextResponse.json(
    { ok, pending: pending.count ?? 0, failedRecently, stuckJobs },
    { status: ok ? 200 : 503 },
  );
}

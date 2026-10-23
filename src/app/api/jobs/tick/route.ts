import { isCronRequest, runInternalJobs, sweepQueue } from "@/lib/app/processing-queue";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

/**
 * Pulso que Supabase (pg_cron + pg_net) envía cada minuto mientras haya
 * trabajos internos pendientes: reintentos, aplazados y reservas caducadas.
 */
export async function POST(request: Request) {
  if (!isCronRequest(request)) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  const admin = createAdminClient();
  await sweepQueue(admin);
  const processed = await runInternalJobs(admin, 8);
  return Response.json({ processed });
}

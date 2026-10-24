import { isCronRequest, runInternalJobs, sweepQueue } from "@/lib/app/processing-queue";
import { sendTurnReminders } from "@/lib/app/email-notifications";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

/**
 * Pulso que Supabase (pg_cron + pg_net) envía cada minuto mientras haya
 * trabajos internos pendientes (reintentos, aplazados y reservas caducadas)
 * o un turno de exposición por avisar por correo.
 */
export async function POST(request: Request) {
  if (!isCronRequest(request)) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  const admin = createAdminClient();
  await sweepQueue(admin);
  const [processed, reminders] = await Promise.all([runInternalJobs(admin, 8), sendTurnReminders(admin)]);
  return Response.json({ processed, reminders });
}

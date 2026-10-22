import { externalBacklog, isWorkerRequest } from "@/lib/app/processing-queue";
import { createAdminClient } from "@/lib/supabase/admin";

/** Cuántos trozos esperan a un trabajador externo; lo consulta el flujo de Kaggle. */
export async function GET(request: Request) {
  if (!isWorkerRequest(request)) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  return Response.json({ pending: await externalBacklog(createAdminClient()) });
}

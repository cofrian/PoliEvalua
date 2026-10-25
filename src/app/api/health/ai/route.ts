import { NextResponse } from "next/server";

import { aiConfigured, modelHealth } from "@/lib/ai/models";
import { groqConfigured } from "@/lib/ai/transcription";
import { isCronRequest } from "@/lib/app/processing-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estado de los modelos de IA en producción. Protegido con JOBS_CRON_SECRET;
 * lo consulta el workflow «Modelos de IA» de GitHub. 503 si alguna tarea se ha
 * quedado sin ningún modelo que responda (catálogo de NVIDIA + llamada real).
 */
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const tasks = await modelHealth();
    const ok = aiConfigured() && tasks.every((task) => task.ok);
    return NextResponse.json(
      {
        ok,
        keyConfigured: aiConfigured(),
        tasks,
        // Informativo: sin Groq todo el audio va al respaldo de Kaggle.
        transcription: {
          groq: groqConfigured(),
          kaggleDispatch: Boolean(process.env.GITHUB_DISPATCH_TOKEN),
        },
      },
      { status: ok ? 200 : 503 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "No se pudo consultar NVIDIA.",
      },
      { status: 503 },
    );
  }
}

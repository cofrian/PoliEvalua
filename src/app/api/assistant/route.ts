import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output } from "ai";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  assistantResponseSchema,
  normalizeEvaluationProposal,
} from "@/lib/ai/evaluation-proposal";
import { aiErrorResponse } from "@/lib/ai/error-response";
import { aiConfigured, NVIDIA_BASE_URL, jsonInstruction, NVIDIA_NO_THINKING, withModelFallback } from "@/lib/ai/models";
import {
  clientIp,
  isBlocked,
  recordAttempt,
} from "@/lib/auth/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  message: z.string().trim().min(3).max(4000),
});

const SYSTEM_PROMPT = `Eres el asistente de configuración de una plataforma de evaluación de la UPV.
Tu ámbito exclusivo es diseñar evaluaciones: páginas de evaluación, requisitos, preguntas, rúbricas,
contexto académico y organización del jurado. Rechaza conversaciones ajenas a ese ámbito.

Genera siempre una propuesta completa que una persona propietaria pueda revisar antes de aplicarla.
Reglas obligatorias:
- Escribe todo en español claro y accesible.
- Los pesos de los criterios deben sumar exactamente 100.
- Cada criterio debe incluir niveles dentro de scaleMin y scaleMax.
- No incluyas datos personales ni solicites información sensible.
- No otorgues notas automáticamente ni decidas ganadores.
- Para docencia, vincula la propuesta con institución, centro, titulación, asignatura y curso si el usuario los indica.
- Si se piden grupos de jurado, propone nombres de paneles; la asignación concreta de personas y proyectos se hará después.
- Usa average como agregación predeterminada, salvo que el usuario pida consenso u otro método.
- La propuesta se guardará como borrador y necesitará confirmación humana.`;

export async function POST(request: Request) {
  const startedAt = Date.now();
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Escribe una petición de entre 3 y 4.000 caracteres." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  }

  const cookieStore = await cookies();
  const eventId = cookieStore.get("active_event_id")?.value;
  if (!eventId) {
    return NextResponse.json({ error: "Selecciona primero un espacio." }, { status: 409 });
  }

  const [{ data: membership }, { data: event }] = await Promise.all([
    supabase
      .from("event_members")
      .select("role, status")
      .eq("event_id", eventId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("events")
      .select("id, name, kind, description, settings")
      .eq("id", eventId)
      .maybeSingle(),
  ]);

  if (
    !event ||
    membership?.status !== "active" ||
    !["owner", "manager"].includes(membership.role)
  ) {
    return NextResponse.json(
      { error: "Solo una persona propietaria o gestora puede usar el asistente." },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const rateKeys = [`assistant:user:${user.id}`, `assistant:ip:${await clientIp()}`];
  if (await isBlocked(admin, "assistant", rateKeys)) {
    return NextResponse.json(
      { error: "Has alcanzado el límite temporal del asistente. Espera diez minutos." },
      { status: 429 },
    );
  }
  await recordAttempt(admin, "assistant", rateKeys);

  if (!aiConfigured()) {
    return NextResponse.json(
      {
        error:
          "El asistente está preparado, pero falta configurar NVIDIA_API_KEY en el servidor.",
      },
      { status: 503 },
    );
  }

  const [{ data: academic }, { data: evaluationPage }, { data: rubric }] =
    await Promise.all([
      supabase
        .from("event_academic_contexts")
        .select(
          "institution, school, degree, subject_name, subject_code, academic_year, term",
        )
        .eq("event_id", event.id)
        .maybeSingle(),
      supabase
        .from("evaluation_pages")
        .select(
          "title, description, instructions, requirements, questions, aggregation_method, min_evaluations",
        )
        .eq("event_id", event.id)
        .maybeSingle(),
      supabase
        .from("rubrics")
        .select(
          "name, scale_min, scale_max, rubric_criteria(title, description, weight, order)",
        )
        .eq("event_id", event.id)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

  const provider = createOpenAICompatible({
    name: "nvidia",
    baseURL: NVIDIA_BASE_URL,
    apiKey: process.env.NVIDIA_API_KEY,
    supportsStructuredOutputs: false,
  });

  try {
    const {
      result: { output },
      modelId,
    } = await withModelFallback(
      "builder",
      (id, abortSignal) =>
        generateText({
          model: provider.chatModel(id),
          output: Output.object({ schema: assistantResponseSchema }),
          system: `${SYSTEM_PROMPT}\n\n${jsonInstruction(assistantResponseSchema)}`,
          prompt: `Contexto actual del espacio (sin datos personales):\n${JSON.stringify({
            event,
            academic,
            evaluationPage,
            rubric,
          })}\n\nPetición del gestor:\n${parsed.data.message}`,
          maxOutputTokens: 4000,
          temperature: 0.2,
          maxRetries: 0,
          abortSignal,
          providerOptions: { nvidia: NVIDIA_NO_THINKING },
        }),
      { deadlineMs: startedAt + 110_000, attemptTimeoutMs: 60_000 },
    );

    const proposal =
      output.scope === "evaluation" && output.proposal
        ? normalizeEvaluationProposal(output.proposal)
        : null;

    const { data: saved, error } = await supabase
      .from("assistant_proposals")
      .insert({
        event_id: event.id,
        user_id: user.id,
        prompt: parsed.data.message,
        reply: output.reply,
        proposal,
        status: proposal ? "pending" : "rejected",
        model: modelId,
      })
      .select("id, created_at")
      .single();

    if (error || !saved) {
      return NextResponse.json(
        { error: "La propuesta se generó, pero no se pudo guardar." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      id: saved.id,
      createdAt: saved.created_at,
      reply: output.reply,
      proposal,
    });
  } catch (error) {
    return aiErrorResponse(
      error,
      "NVIDIA no ha podido generar una propuesta válida. Inténtalo de nuevo con una descripción más concreta.",
    );
  }
}


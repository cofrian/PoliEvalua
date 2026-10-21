import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  evaluationProposalSchema,
  normalizeEvaluationProposal,
} from "@/lib/ai/evaluation-proposal";
import { aiErrorResponse } from "@/lib/ai/error-response";
import { aiConfigured, NVIDIA_BASE_URL, withModelFallback } from "@/lib/ai/models";
import { clientIp, isBlocked, recordAttempt } from "@/lib/auth/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  message: z.string().trim().min(3).max(4000),
});

const spaceDraftSchema = z.object({
  reply: z.string().trim().min(2).max(2000),
  space: z.object({
    kind: z.enum(["hackathon", "class", "awards", "project", "custom"]),
    name: z.string().trim().min(3).max(100),
    description: z.string().trim().max(500).nullable(),
    participantMode: z.enum(["teams", "groups", "individuals", "candidates"]),
    evaluationMode: z.enum(["rubric", "feedback", "mixed"]),
    modules: z
      .array(z.enum(["participants", "rubric", "notes", "results", "sponsors"]))
      .min(1),
    enabledRoles: z
      .array(z.enum(["judge", "mentor", "teacher", "student", "reviewer", "viewer"]))
      .min(1),
    joinRoles: z.array(z.enum(["judge", "mentor", "student", "reviewer", "viewer"])),
  }),
  proposal: evaluationProposalSchema.nullable(),
});

export type SpaceDraft = z.infer<typeof spaceDraftSchema>;

const SYSTEM_PROMPT = `Eres el asistente de creación de espacios de una plataforma de evaluación de la UPV.
A partir de la descripción del usuario configuras un espacio nuevo y, si hay información suficiente,
una propuesta de evaluación (rúbrica, requisitos, preguntas, contexto académico y paneles de jurado).

Tipos de espacio: hackathon, class (asignatura), awards (premios), project (proyectos), custom.
Unidad participante: teams, groups (grupos de clase), individuals, candidates.
Evaluación: rubric (puntuación), feedback (solo comentarios), mixed (ambas).
Perfiles: judge, mentor, teacher, student, reviewer, viewer. joinRoles solo puede incluir perfiles
habilitados y nunca teacher.

Reglas obligatorias:
- Escribe todo en español claro y accesible.
- Los pesos de los criterios deben sumar exactamente 100 y cada criterio debe incluir niveles dentro de scaleMin y scaleMax.
- Si es docencia, rellena academic con institución (por defecto Universitat Politècnica de València), asignatura y lo que indique el usuario.
- Si la evaluación es solo de comentarios o no hay datos para una rúbrica, devuelve proposal null.
- No incluyas datos personales ni otorgues notas o ganadores.
- En reply resume en dos o tres frases lo que has configurado y qué conviene revisar.`;

export async function POST(request: Request) {
  const startedAt = Date.now();
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Escribe una descripción de entre 3 y 4.000 caracteres." },
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
      { error: "Falta configurar NVIDIA_API_KEY en el servidor." },
      { status: 503 },
    );
  }

  const provider = createOpenAICompatible({
    name: "nvidia",
    baseURL: NVIDIA_BASE_URL,
    apiKey: process.env.NVIDIA_API_KEY,
    supportsStructuredOutputs: true,
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
          output: Output.object({ schema: spaceDraftSchema }),
          system: SYSTEM_PROMPT,
          prompt: `Descripción del espacio que quiere crear el usuario:\n${parsed.data.message}`,
          maxOutputTokens: 5000,
          temperature: 0.2,
          maxRetries: 0,
          abortSignal,
        }),
      { deadlineMs: startedAt + 55_000, attemptTimeoutMs: 35_000 },
    );

    const space = {
      ...output.space,
      joinRoles: output.space.joinRoles.filter((role) =>
        (output.space.enabledRoles as string[]).includes(role),
      ),
    };

    return NextResponse.json({
      reply: output.reply,
      space,
      proposal: output.proposal ? normalizeEvaluationProposal(output.proposal) : null,
      model: modelId,
    });
  } catch (error) {
    return aiErrorResponse(
      error,
      "NVIDIA no ha podido generar una configuración válida. Prueba con una descripción más concreta.",
    );
  }
}

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getLocale, getTranslations } from "next-intl/server";
import { LOCALE_RULE, type SpaceLocale } from "@/lib/ai/prompts/presentation";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  evaluationProposalSchema,
  normalizeEvaluationProposal,
} from "@/lib/ai/evaluation-proposal";
import { aiErrorResponse } from "@/lib/ai/error-response";
import { generateJson } from "@/lib/ai/generate-json";
import { aiConfigured, NVIDIA_BASE_URL, withModelFallback } from "@/lib/ai/models";
import { clientIp, isBlocked, recordAttempt } from "@/lib/auth/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  message: z.string().trim().min(3).max(4000),
});

const spaceDraftSchema = z.object({
  reply: z.string().trim().min(2).max(2000),
  /** Lo imprescindible que falta; si hay preguntas, space puede ser null. */
  questions: z.array(z.string().trim().min(3).max(300)).max(5),
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
  }).nullable(),
  proposal: evaluationProposalSchema.nullable(),
});

export type SpaceDraft = z.infer<typeof spaceDraftSchema>;

const systemPrompt = (locale: SpaceLocale) => `Eres el asistente de creación de espacios de una plataforma de evaluación de la UPV.
A partir de la descripción del usuario configuras un espacio nuevo y, si hay información suficiente,
una propuesta de evaluación (rúbrica, requisitos, preguntas, contexto académico y paneles de jurado).

Tipos de espacio: hackathon, class (asignatura), awards (premios), project (proyectos), custom.
Unidad participante: teams, groups (grupos de clase), individuals, candidates.
Evaluación: rubric (puntuación), feedback (solo comentarios), mixed (ambas).
Perfiles: judge, mentor, teacher, student, reviewer, viewer. joinRoles solo puede incluir perfiles
habilitados y nunca teacher.

Reglas obligatorias:
- ${LOCALE_RULE[locale] ?? LOCALE_RULE.es} Que sea accesible.
- Los pesos de los criterios deben sumar exactamente 100 y cada criterio debe incluir niveles dentro de scaleMin y scaleMax.
- Si es docencia, rellena academic con institución (por defecto Universitat Politècnica de València), asignatura y lo que indique el usuario.
- Si la evaluación es solo de comentarios o no hay datos para una rúbrica, devuelve proposal null.
- No incluyas datos personales ni otorgues notas o ganadores.
- En reply resume en dos o tres frases lo que has configurado y qué conviene revisar.
- Si no queda claro qué tipo de actividad es, quién participa o qué se evalúa, NO lo inventes: devuelve space null y proposal null y pregunta en questions (máximo 5 preguntas cortas). Si con lo que hay ya puedes configurar el espacio pero no la rúbrica, configura el espacio, deja proposal null y pregunta lo que falta para la rúbrica.`;

export async function POST(request: Request) {
  const startedAt = Date.now();
  const locale = (await getLocale()) as SpaceLocale;
  const t = await getTranslations("assistant.errors");
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: t("length") }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: t("login") }, { status: 401 });
  }

  const admin = createAdminClient();
  const rateKeys = [`assistant:user:${user.id}`, `assistant:ip:${await clientIp()}`];
  if (await isBlocked(admin, "assistant", rateKeys)) {
    return NextResponse.json({ error: t("rateLimit") }, { status: 429 });
  }
  await recordAttempt(admin, "assistant", rateKeys);

  if (!aiConfigured()) {
    return NextResponse.json({ error: t("notConfigured") }, { status: 503 });
  }

  const provider = createOpenAICompatible({
    name: "nvidia",
    baseURL: NVIDIA_BASE_URL,
    apiKey: process.env.NVIDIA_API_KEY,
    supportsStructuredOutputs: false,
  });

  try {
    const { result: output, modelId } = await withModelFallback(
      "builder",
      (id, abortSignal) =>
        generateJson({
          provider,
          modelId: id,
          schema: spaceDraftSchema,
          system: systemPrompt(locale),
          prompt: `Descripción del espacio que quiere crear el usuario:\n${parsed.data.message}`,
          abortSignal,
        }),
      { deadlineMs: startedAt + 110_000, attemptTimeoutMs: 60_000 },
    );

    const space = output.space
      ? {
          ...output.space,
          joinRoles: output.space.joinRoles.filter((role) =>
            (output.space!.enabledRoles as string[]).includes(role),
          ),
        }
      : null;

    return NextResponse.json({
      reply: output.reply,
      questions: output.questions,
      space,
      proposal: output.proposal ? normalizeEvaluationProposal(output.proposal) : null,
      model: modelId,
    });
  } catch (error) {
    return aiErrorResponse(error, t("invalid"));
  }
}

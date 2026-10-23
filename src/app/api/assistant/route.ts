import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ModelMessage } from "ai";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  assistantChatSchema,
  normalizeEvaluationProposal,
  type AssistantAction,
} from "@/lib/ai/evaluation-proposal";
import { aiErrorResponse } from "@/lib/ai/error-response";
import { generateJson } from "@/lib/ai/generate-json";
import { aiConfigured, NVIDIA_BASE_URL, withModelFallback } from "@/lib/ai/models";
import { LOCALE_RULE, type SpaceLocale } from "@/lib/ai/prompts/presentation";
import {
  clientIp,
  isBlocked,
  recordAttempt,
} from "@/lib/auth/rate-limit";
import { vocabulary } from "@/lib/app/vocabulary";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  message: z.string().trim().min(3).max(4000),
  /** Sin hilo se empieza una conversación nueva. */
  threadId: z.string().uuid().nullish(),
});

/** Turnos anteriores que se le pasan al modelo (los más recientes). */
const HISTORY_TURNS = 8;

const systemPrompt = (locale: SpaceLocale) => `Eres el asistente de configuración de una plataforma de evaluación de la UPV.
Hablas con la persona que gestiona un espacio (una asignatura, un hackathon, unos premios…).
Tu ámbito exclusivo es preparar ese espacio: la evaluación y su rúbrica, los grupos o equipos y la agenda de exposiciones. Rechaza lo que quede fuera (scope "out_of_scope").

Acciones que puedes proponer (una por respuesta, en "action"):
- "evaluation": página de evaluación y rúbrica completas.
- "groups": crear grupos o equipos nuevos con los nombres de sus integrantes.
- "agenda": repartir los grupos que ya existen en salas y turnos.

Antes de proponer una acción comprueba que tienes lo imprescindible:
- evaluation: qué se evalúa y los criterios (o permiso explícito para que los propongas tú) y la escala.
- groups: cuántos grupos y cómo se llaman o quién va en cada uno (o permiso para numerarlos «Grupo 1», «Grupo 2»…).
- agenda: salas, día y hora de inicio y minutos por turno. Debe haber grupos creados.
Si falta algo imprescindible, NO lo inventes: deja "action" a null y pregunta en "questions" (máximo 5 preguntas cortas y concretas). Puedes usar lo que la persona ya dijo antes en la conversación.
Si la petición es ambigua entre varias acciones, pregunta cuál quiere.

Reglas obligatorias:
- ${LOCALE_RULE[locale] ?? LOCALE_RULE.es} Que sea accesible.
- "reply" explica en una o dos frases qué propones o qué te falta. No repitas en "reply" las preguntas de "questions".
- Los pesos de los criterios deben sumar exactamente 100 y cada criterio incluye niveles entre scaleMin y scaleMax.
- No incluyas datos personales que la persona no te haya dado ni pidas información sensible.
- No pongas notas ni decidas ganadores.
- Para docencia, vincula la evaluación con institución, centro, titulación, asignatura y curso si los indica.
- Usa average como agregación salvo que pida consenso u otro método.
- La hora de "agenda.start" es hora de Valencia en formato AAAA-MM-DDTHH:MM; calcula fechas relativas («mañana») a partir de la fecha de hoy del contexto.
- Nada se aplica sin que la persona lo confirme; dilo si te lo pregunta.`;

export async function POST(request: Request) {
  const startedAt = Date.now();
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

  const cookieStore = await cookies();
  const eventId = cookieStore.get("active_event_id")?.value;
  if (!eventId) {
    return NextResponse.json({ error: t("chooseSpace") }, { status: 409 });
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
      .select("id, name, kind, description, settings, locale")
      .eq("id", eventId)
      .maybeSingle(),
  ]);

  if (
    !event ||
    membership?.status !== "active" ||
    !["owner", "manager"].includes(membership.role)
  ) {
    return NextResponse.json({ error: t("onlyManagers") }, { status: 403 });
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

  const threadId = parsed.data.threadId ?? crypto.randomUUID();
  const [{ data: academic }, { data: evaluationPage }, { data: rubric }, { data: teams }, { count: slots }, { data: previous }] =
    await Promise.all([
      supabase
        .from("event_academic_contexts")
        .select("institution, school, degree, subject_name, subject_code, academic_year, term")
        .eq("event_id", event.id)
        .maybeSingle(),
      supabase
        .from("evaluation_pages")
        .select("title, description, instructions, requirements, questions, aggregation_method, min_evaluations")
        .eq("event_id", event.id)
        .maybeSingle(),
      supabase
        .from("rubrics")
        .select("name, scale_min, scale_max, rubric_criteria(title, description, weight, order)")
        .eq("event_id", event.id)
        .eq("is_active", true)
        .maybeSingle(),
      supabase.from("teams").select("number, name, team_members(count)").eq("event_id", event.id).order("number"),
      supabase.from("presentation_slots").select("id", { count: "exact", head: true }).eq("event_id", event.id),
      parsed.data.threadId
        ? supabase
            .from("assistant_proposals")
            .select("prompt, reply, questions, action, status")
            .eq("event_id", event.id)
            .eq("user_id", user.id)
            .eq("thread_id", parsed.data.threadId)
            .order("created_at", { ascending: false })
            .limit(HISTORY_TURNS)
        : Promise.resolve({ data: [] }),
    ]);

  // Historial en orden cronológico; las preguntas que hizo el asistente cuentan como suyas.
  const history: ModelMessage[] = [...(previous ?? [])].reverse().flatMap((turn) => [
    { role: "user" as const, content: turn.prompt },
    {
      role: "assistant" as const,
      content: [
        turn.reply,
        ...((turn.questions as string[] | null) ?? []).map((question) => `- ${question}`),
        turn.action !== "none" ? `(Propuesta de tipo ${turn.action}: ${turn.status})` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ]);

  const words = vocabulary(event, event.locale);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" }).format(new Date());
  const context = {
    today,
    space: { name: event.name, kind: event.kind, description: event.description, units: words.units },
    academic,
    evaluationPage,
    rubric,
    groups: (teams ?? []).map((team) => ({
      number: team.number,
      name: team.name,
      members: (team.team_members as unknown as { count: number }[])?.[0]?.count ?? 0,
    })),
    agendaSlots: slots ?? 0,
  };

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
          schema: assistantChatSchema,
          system: systemPrompt(event.locale),
          history,
          prompt: `Contexto actual del espacio (sin datos personales):\n${JSON.stringify(context)}\n\nMensaje de la persona:\n${parsed.data.message}`,
          abortSignal,
          maxOutputTokens: 4000,
        }),
      { deadlineMs: startedAt + 110_000, attemptTimeoutMs: 60_000 },
    );

    let action: AssistantAction | null = output.scope === "space" ? output.action : null;
    if (action?.type === "evaluation") {
      action = { ...action, proposal: normalizeEvaluationProposal(action.proposal) };
    }
    // Una agenda sin grupos no se puede aplicar: mejor preguntar.
    const questions = [...output.questions];
    if (action?.type === "agenda" && !context.groups.length) {
      action = null;
      questions.push(t("agendaNeedsGroups", { units: words.unitsLower }));
    }

    const { data: saved, error } = await supabase
      .from("assistant_proposals")
      .insert({
        event_id: event.id,
        user_id: user.id,
        thread_id: threadId,
        prompt: parsed.data.message,
        reply: output.reply,
        questions,
        action: action?.type ?? "none",
        proposal: action,
        status: action ? "pending" : "info",
        model: modelId,
      })
      .select("id, created_at")
      .single();

    if (error || !saved) {
      return NextResponse.json({ error: t("saveFailed") }, { status: 500 });
    }

    return NextResponse.json({
      id: saved.id,
      threadId,
      createdAt: saved.created_at,
      reply: output.reply,
      questions,
      action,
    });
  } catch (error) {
    return aiErrorResponse(error, t("invalid"));
  }
}

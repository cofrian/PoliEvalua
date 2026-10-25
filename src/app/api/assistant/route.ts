import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ModelMessage } from "ai";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  assistantChatPromptSchema,
  assistantChatSchema,
  normalizeEvaluationProposal,
  settingsChangeSchema,
  type AssistantAction,
  type SettingsChange,
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

const NUMBER_WORDS =
  /\b(\d+|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|quatre|cinc|sis|set|vuit|nou|deu|onze|dotze|vint|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty)\b/i;

/** ¿Ha dicho la persona alguna cantidad? (cifras o palabras en es, ca y en). */
function mentionsNumber(text: string) {
  return NUMBER_WORDS.test(text);
}

/** «2026-11-05 9:00», «2026-11-05T09:00:00»… → «2026-11-05T09:00»; null si no hay día y hora. */
function normalizeStart(value: string | null | undefined) {
  const match = value?.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})/);
  return match ? `${match[1]}T${match[2].padStart(2, "0")}:${match[3]}` : null;
}

const agendaExtractSchema = z.object({
  rooms: z.array(z.string().trim().min(1).max(80)).max(20).nullish(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().catch(null),
  time: z.string().regex(/^\d{1,2}:\d{2}$/).nullish().catch(null),
  durationMinutes: z.number().int().min(1).max(240).nullish().catch(null),
  gapMinutes: z.number().int().min(0).max(120).nullish().catch(null),
  order: z.enum(["number", "random"]).nullish().catch(null),
});

const groupsExtractSchema = z.object({
  count: z.number().int().min(1).max(80).nullish().catch(null),
  names: z.array(z.string().trim().min(1).max(120)).max(80).nullish(),
  members: z.array(z.array(z.string().trim().max(120)).max(20)).max(80).nullish(),
});

type EventSettings = {
  recording?: { enabled?: boolean };
  participant_mode?: string;
  students?: { show_rubric?: boolean; publish_results?: boolean };
  public_vote?: { open?: boolean; show_results?: boolean; title?: string | null; mode?: string };
  notifications?: { turn_minutes?: number };
  materials?: { drive_url?: string | null };
};

/** Cómo está ahora cada ajuste que el asistente puede cambiar (sin datos personales). */
function currentSettings(
  event: { name: string; status: string; signup_open: boolean; locale: string; settings: unknown },
  joinCodeRoles: string[],
) {
  const settings = (event.settings ?? {}) as EventSettings;
  return {
    name: event.name,
    status: event.status,
    locale: event.locale,
    signupOpen: event.signup_open,
    recording: settings.recording?.enabled === true,
    participantMode: settings.participant_mode ?? null,
    students: { showRubric: settings.students?.show_rubric === true, publishResults: settings.students?.publish_results === true },
    publicVote: {
      open: settings.public_vote?.open === true,
      showResults: settings.public_vote?.show_results === true,
      title: settings.public_vote?.title ?? null,
      mode: settings.public_vote?.mode === "rubric" ? "rubric" : "favorite",
    },
    turnReminderMinutes: settings.notifications?.turn_minutes ?? 10,
    materialsFolder: Boolean(settings.materials?.drive_url),
    joinCodeRoles,
  };
}

/** Turnos anteriores que se le pasan al modelo (los más recientes). */
const HISTORY_TURNS = 8;

/** Ajustes que el asistente puede cambiar (la misma lista para la respuesta y para la extracción). */
const SETTINGS_GUIDE = `  - {"setting":"recording","enabled":true|false} grabar las exposiciones.
  - {"setting":"signup","open":true|false} permitir entrar con código.
  - {"setting":"status","status":"setup"|"building"|"judging"|"closed"} fase del espacio (preparación, en marcha, evaluación, cerrado). Solo si piden cambiar de fase o cerrar el espacio de forma explícita.
  - {"setting":"name","name":"…"} nombre del espacio.
  - {"setting":"locale","locale":"es"|"ca"|"en"} idioma del espacio.
  - {"setting":"participantMode","mode":"teams"|"groups"|"individuals"|"candidates"} quién participa.
  - {"setting":"students","showRubric":true|false|null,"publishResults":true|false|null} qué ven los participantes (null = no cambiar). «Publicar los resultados» o «enseñar las notas» es publishResults: true; no tiene nada que ver con la fase.
  - {"setting":"publicVote","open":true|false|null,"showResults":true|false|null,"title":"…"|null,"mode":"favorite"|"rubric"|null} votación del público: "favorite" = cada persona elige su proyecto favorito; "rubric" = el público puntúa cada proyecto con los criterios de la rúbrica.
  - {"setting":"turnReminder","minutes":5|10|15|30} aviso por correo antes de cada exposición.
  - {"setting":"materials","driveUrl":"https://…"|null,"instructions":"…"|null} carpeta e instrucciones de las entregas.
  - {"setting":"aiInstructions","instructions":"…"} instrucciones para la IA que analiza las exposiciones.
  - {"setting":"challenge","name":"…","description":"…"|null} crear un reto o categoría.
  - {"setting":"invite","email":"…","role":"manager"|"judge"|"mentor"|"student"|"viewer"} invitar a una persona por correo (solo con un correo que te hayan dado).
  - {"setting":"joinCode","role":"judge"|"mentor"|"student"|"viewer","enabled":true|false} crear un código nuevo de acceso para ese rol o desactivarlo.`;

const systemPrompt = (locale: SpaceLocale) => `Eres el asistente de configuración de una plataforma de evaluación de la UPV.
Hablas con la persona que gestiona un espacio (una asignatura, un hackathon, unos premios…).
Tu ámbito exclusivo es preparar y gestionar ese espacio: la evaluación y su rúbrica, los grupos o equipos, la agenda de exposiciones y los ajustes del menú de gestión. Rechaza lo que quede fuera (scope "out_of_scope").

Acciones que puedes proponer (una por respuesta, en "action"):
- "evaluation": página de evaluación y rúbrica completas.
- "groups": crear grupos o equipos nuevos con los nombres de sus integrantes.
- "agenda": repartir los grupos que ya existen en salas y turnos.
- "settings": uno o varios cambios de ajustes, en "changes" (lista). Cada cambio lleva "setting" y sus campos:
${SETTINGS_GUIDE}
  Usa "currentSettings" del contexto para saber cómo está cada cosa y no propongas lo que ya está así. Si piden algo del menú que no está en esta lista (patrocinadores con logo, borrar cosas, cambiar el rol de una persona concreta…), explícales en qué sección del menú se hace.

En "intent" indica siempre qué quiere hacer la persona (evaluation, groups, agenda u other), aunque todavía no puedas proponer la acción.

Antes de proponer una acción comprueba que tienes lo imprescindible:
- evaluation: qué se evalúa y los criterios (o permiso explícito para que los propongas tú) y la escala.
- groups: CUÁNTOS grupos (imprescindible: si la persona no da el número ni una lista de la que deducirlo, pregunta; nunca supongas una cantidad) y cómo se llaman o quién va en cada uno (si no lo dice, puedes numerarlos «Grupo 1», «Grupo 2»…).
- agenda: salas, día y hora de inicio y minutos por turno. Debe haber grupos creados.
- settings: que la petición diga claramente qué cambiar (activar o desactivar, a qué valor, qué correo…).
Si falta algo imprescindible, NO lo inventes: deja "action" a null y pregunta en "questions" (máximo 5 preguntas cortas y concretas). Puedes usar lo que la persona ya dijo antes en la conversación.
Si la petición es ambigua entre varias acciones, pregunta cuál quiere.

Reglas obligatorias:
- ${LOCALE_RULE[locale] ?? LOCALE_RULE.es} Que sea accesible.
- "reply" explica en una o dos frases qué propones o qué te falta. No repitas en "reply" las preguntas de "questions".
- Nunca digas que has creado o aplicado algo: solo lo propones («Te propongo…»); la persona lo aplica al confirmar.
- Si haces preguntas, "action" tiene que ser null. Si ya tienes lo imprescindible, propón la acción y no preguntes nada más.
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
      .select("id, name, kind, description, settings, locale, status, signup_open")
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

  const { data: joinCodes } = await admin.from("event_join_codes").select("role").eq("event_id", event.id);
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
    currentSettings: currentSettings(event, (joinCodes ?? []).map((row) => row.role)),
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
          promptSchema: assistantChatPromptSchema,
          system: systemPrompt(event.locale),
          history,
          prompt: `Contexto actual del espacio (sin datos personales):\n${JSON.stringify(context)}\n\nMensaje de la persona:\n${parsed.data.message}`,
          abortSignal,
          maxOutputTokens: 4000,
        }),
      { deadlineMs: startedAt + 110_000, attemptTimeoutMs: 40_000 },
    );

    // El servidor decide si falta algo imprescindible: los modelos a veces se
    // lo inventan y a veces preguntan sin motivo.
    if (process.env.DEBUG_ASSISTANT) console.log("ASISTENTE", modelId, JSON.stringify(output));
    const userMessages = [...[...(previous ?? [])].reverse().map((turn) => turn.prompt), parsed.data.message];
    const userText = userMessages.join("\n");
    const intent = output.action?.type ?? (output.scope === "space" ? output.intent : "other");
    const missing: string[] = [];
    let action: AssistantAction | null = null;

    // Para grupos y agenda los datos se sacan de lo que ha escrito la persona con
    // una llamada aparte y muy acotada; el servidor comprueba qué falta.
    const extract = <T,>(schema: z.ZodType<T>, task: string) =>
      withModelFallback(
        "builder",
        (id, abortSignal) =>
          generateJson({
            provider,
            modelId: id,
            schema,
            system: `Extraes datos de los mensajes de una persona que prepara un espacio de evaluación. ${task}
Usa solo lo que la persona haya dicho de forma explícita en sus mensajes; pon null en lo que no haya dicho. No inventes nada.`,
            prompt: `Hoy es ${today} (hora de Valencia).\nMensajes de la persona, del más antiguo al más reciente:\n${userMessages.map((text, index) => `${index + 1}. ${text}`).join("\n")}`,
            abortSignal,
            maxOutputTokens: 1500,
          }),
        { deadlineMs: startedAt + 110_000, attemptTimeoutMs: 30_000 },
      ).then(({ result }) => result);

    if (intent === "agenda") {
      const complete = output.action?.type === "agenda" ? output.action : null;
      const data = complete?.rooms?.length && normalizeStart(complete.start) && complete.durationMinutes
        ? { rooms: complete.rooms, start: complete.start, durationMinutes: complete.durationMinutes, gapMinutes: complete.gapMinutes, order: complete.order }
        : await extract(
            agendaExtractSchema,
            "Datos de la agenda de exposiciones: salas, fecha (AAAA-MM-DD), hora de inicio (HH:MM), minutos por turno, minutos de descanso entre turnos y orden (number o random).",
          ).then((found) => ({
            rooms: found.rooms,
            start: found.date && found.time ? `${found.date}T${found.time}` : null,
            durationMinutes: found.durationMinutes,
            gapMinutes: found.gapMinutes,
            order: found.order,
          }));
      const start = normalizeStart(data.start);
      if (!context.groups.length) missing.push(t("agendaNeedsGroups", { units: words.unitsLower }));
      if (!data.rooms?.length) missing.push(t("askRooms"));
      if (!start) missing.push(t("askStart"));
      if (!data.durationMinutes) missing.push(t("askDuration"));
      if (!missing.length) {
        action = {
          type: "agenda",
          rooms: data.rooms!,
          start: start!,
          durationMinutes: data.durationMinutes!,
          gapMinutes: data.gapMinutes ?? 0,
          order: data.order ?? "number",
        };
      }
    } else if (intent === "groups") {
      const found = await extract(
        groupsExtractSchema,
        "Grupos que quiere crear: cuántos (count), sus nombres si los da (names) y los integrantes de cada uno si los da (members, en el mismo orden que names).",
      );
      // Solo cuentan los nombres que aparecen de verdad en lo que ha escrito.
      const lowered = userText.toLocaleLowerCase();
      // («Grupo 1 a Grupo 6» no nombra los intermedios: entonces vale el número).
      const listed = found.names ?? [];
      const allNamed = listed.length > 0 && listed.every((name) => lowered.includes(name.toLocaleLowerCase()));
      const names = allNamed
        ? listed
        : found.count && mentionsNumber(userText)
          ? Array.from({ length: found.count }, (_, index) => `${words.unit} ${index + 1}`)
          : [];
      if (!names.length) {
        missing.push(t("askGroupsCount", { units: words.unitsLower }));
      } else {
        action = {
          type: "groups",
          groups: names.slice(0, 80).map((name, index) => ({
            name: name.slice(0, 120),
            projectTitle: null,
            members: (found.members?.[index] ?? []).filter((member) => member.trim().length >= 2).slice(0, 20),
          })),
        };
      }
    } else if (output.action?.type === "settings") {
      action = output.action;
    } else if (intent === "settings") {
      // El modelo ha entendido que se piden ajustes pero no los ha detallado.
      const found = await extract(
        z.object({ changes: z.array(z.unknown()).max(15).nullish() }),
        `Cambios de ajustes que pide en su último mensaje, como lista "changes" con este formato:\n${SETTINGS_GUIDE}`,
      );
      const changes = (found.changes ?? []).filter((change) => settingsChangeSchema.safeParse(change).success) as SettingsChange[];
      if (changes.length) action = { type: "settings", changes };
      else missing.push(t("askSettings"));
    } else if (output.action?.type === "evaluation") {
      action = { ...output.action, proposal: normalizeEvaluationProposal(output.action.proposal) };
    }

    // Con huecos solo se pregunta; si está completo, se propone sin más preguntas.
    const questions = missing.length
      ? missing
      : action
        ? []
        : output.questions.length || output.intent !== "evaluation"
          ? output.questions
          : [t("askEvaluation")];
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

import "server-only";

import { z } from "zod";

// Modelos de NVIDIA por tarea, con cadena de respaldo. Si un modelo ha sido
// retirado, está saturado o devuelve una salida inválida, se prueba el
// siguiente. Las cadenas se pueden sobrescribir desde Vercel sin desplegar
// código: NVIDIA_MODELS_BUILDER y NVIDIA_MODELS_ANALYSIS (separados por comas).
// NVIDIA_MODEL, si existe, se antepone a ambas por compatibilidad.

export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

export type ModelTask = "builder" | "analysis";

/** Valores por defecto. scripts/check-nvidia-models.mjs los vigila en CI. */
export const DEFAULT_MODELS: Record<ModelTask, string[]> = {
  // Configuración de espacios y rúbricas: JSON estructurado con el usuario esperando.
  builder: [
    "deepseek-ai/deepseek-v4.1-flash",
    "z-ai/glm-5.3-flash",
    "nvidia/nemotron-3-super-120b-a12b",
  ],
  // Análisis de transcripciones largas en segundo plano: prima la calidad.
  analysis: [
    "z-ai/glm-5.3",
    "moonshotai/kimi-k2.6",
    "deepseek-ai/deepseek-v4.1-flash",
  ],
};

const ENV_KEYS: Record<ModelTask, string> = {
  builder: "NVIDIA_MODELS_BUILDER",
  analysis: "NVIDIA_MODELS_ANALYSIS",
};

const UNAVAILABLE_TTL_MS = 15 * 60 * 1000;
const CATALOG_TTL_MS = 10 * 60 * 1000;

// Memoria por instancia: evita insistir con un modelo retirado en cada petición.
const unavailableUntil = new Map<string, number>();
let catalogCache: { at: number; ids: Set<string> } | null = null;

/**
 * Parámetros extra para NVIDIA: los modelos de razonamiento (DeepSeek, GLM,
 * Kimi, Nemotron) piensan antes de responder y con salidas JSON largas se
 * pasan del tiempo del servidor. Para rellenar formularios no hace falta, así
 * que se desactiva. Cada plantilla lee su clave e ignora las demás.
 */
export const NVIDIA_NO_THINKING = {
  chat_template_kwargs: { thinking: false, enable_thinking: false },
};

/**
 * Instrucción con el esquema JSON esperado. Se pide JSON normal (no la salida
 * estructurada estricta de NVIDIA, que con esquemas grandes tarda minutos) y
 * la respuesta se valida después con el mismo esquema de zod.
 */
export function jsonInstruction(schema: z.ZodType) {
  return `Responde únicamente con un objeto JSON válido, sin texto antes ni después y sin bloques de código, que cumpla este JSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}`;
}

export function aiConfigured() {
  return Boolean(process.env.NVIDIA_API_KEY);
}

export function modelChain(task: ModelTask) {
  const fromEnv = (process.env[ENV_KEYS[task]] ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const legacy = process.env.NVIDIA_MODEL?.trim();
  const chain = [...(legacy ? [legacy] : []), ...(fromEnv.length ? fromEnv : DEFAULT_MODELS[task])];
  return [...new Set(chain)];
}

/** Error que no se arregla cambiando de modelo (clave inválida, sin clave…). */
export class AiConfigError extends Error {}

/** Todos los modelos de la cadena fallaron. */
export class AllModelsFailedError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly attempts: { model: string; reason: string }[],
  ) {
    super(message);
  }
}

type Failure = "unavailable" | "transient" | "invalid_output" | "auth";

function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value =
    ("statusCode" in error && error.statusCode) ||
    ("status" in error && error.status) ||
    ("response" in error &&
      error.response &&
      typeof error.response === "object" &&
      "status" in error.response &&
      error.response.status);
  return typeof value === "number" ? value : undefined;
}

export function classifyModelError(error: unknown): Failure {
  const status = statusOf(error);
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (status === 401 || status === 403) return "auth";
  if (
    status === 404 ||
    status === 410 ||
    /model.*(not found|does not exist|deprecated|unknown|not available)|function.*not found/i.test(message)
  ) {
    return "unavailable";
  }
  if (
    status === 422 ||
    /NoObjectGenerated|ZodError|JSON|schema|parse|structured output/i.test(message)
  ) {
    return "invalid_output";
  }
  return "transient";
}

const failureLabels: Record<Failure, string> = {
  unavailable: "no disponible",
  transient: "sin respuesta o saturado",
  invalid_output: "respuesta inválida",
  auth: "clave rechazada",
};

/**
 * Ejecuta `run` con cada modelo de la cadena hasta que uno funcione.
 * `deadlineMs` evita empezar un intento que no cabe en el tiempo del servidor.
 */
export async function withModelFallback<T>(
  task: ModelTask,
  run: (modelId: string, signal: AbortSignal) => Promise<T>,
  { deadlineMs, attemptTimeoutMs }: { deadlineMs?: number; attemptTimeoutMs: number },
): Promise<{ result: T; modelId: string }> {
  if (!aiConfigured()) {
    throw new AiConfigError("Falta configurar NVIDIA_API_KEY en el servidor.");
  }

  const now = Date.now();
  const chain = modelChain(task);
  const candidates = chain.filter((id) => (unavailableUntil.get(id) ?? 0) < now);
  // Si todos están marcados, se reintenta igualmente: la marca puede estar obsoleta.
  const queue = candidates.length ? candidates : chain;
  const attempts: { model: string; reason: string }[] = [];

  for (const modelId of queue) {
    const remaining = deadlineMs ? deadlineMs - Date.now() : attemptTimeoutMs;
    if (remaining < 8_000) break;
    try {
      const signal = AbortSignal.timeout(Math.min(attemptTimeoutMs, remaining));
      return { result: await run(modelId, signal), modelId };
    } catch (error) {
      // Errores ajenos al modelo (p. ej. aplazar por cupo) suben tal cual.
      if (error && typeof error === "object" && "passthrough" in error) throw error;
      const failure = classifyModelError(error);
      const detail = error instanceof Error ? error.message.slice(0, 200) : "error desconocido";
      console.error(`Modelo ${modelId} (${task}) falló [${failure}]: ${detail}`);
      if (failure === "auth") {
        throw new AiConfigError("NVIDIA ha rechazado la clave. Revisa NVIDIA_API_KEY.");
      }
      if (failure === "unavailable") unavailableUntil.set(modelId, Date.now() + UNAVAILABLE_TTL_MS);
      attempts.push({ model: modelId, reason: failureLabels[failure] });
    }
  }

  const allUnavailable =
    attempts.length > 0 && attempts.every((attempt) => attempt.reason === failureLabels.unavailable);
  throw new AllModelsFailedError(
    allUnavailable
      ? "Ninguno de los modelos configurados está disponible en NVIDIA."
      : "Los modelos de IA no han respondido a tiempo. Inténtalo de nuevo en un momento.",
    !allUnavailable,
    attempts,
  );
}

/** Catálogo público de NVIDIA (no necesita clave). */
export async function availableModelIds() {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.ids;
  const response = await fetch(`${NVIDIA_BASE_URL}/models`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`El catálogo de NVIDIA respondió ${response.status}.`);
  const body = (await response.json()) as { data?: { id: string }[] };
  const ids = new Set((body.data ?? []).map((model) => model.id));
  catalogCache = { at: Date.now(), ids };
  return ids;
}

export async function modelHealth() {
  const ids = await availableModelIds();
  return (Object.keys(DEFAULT_MODELS) as ModelTask[]).map((task) => {
    const models = modelChain(task).map((id) => ({ id, listed: ids.has(id) }));
    return {
      task,
      ok: models.some((model) => model.listed),
      primaryListed: models[0]?.listed ?? false,
      models,
    };
  });
}

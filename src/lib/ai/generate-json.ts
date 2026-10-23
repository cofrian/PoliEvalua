import "server-only";

import type { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, type ModelMessage } from "ai";
import type { z } from "zod";

import { jsonInstruction, NVIDIA_NO_THINKING } from "@/lib/ai/models";

type Provider = ReturnType<typeof createOpenAICompatible>;

/** La respuesta no cumple el esquema ni tras pedir la corrección. */
export class InvalidModelOutputError extends Error {
  constructor(message: string) {
    // «schema» hace que withModelFallback lo clasifique como respuesta inválida.
    super(`La respuesta no cumple el schema: ${message}`);
  }
}

/** Saca el objeto JSON aunque venga dentro de ```json … ``` o con texto alrededor. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new SyntaxError("No hay ningún objeto JSON en la respuesta.");
  return JSON.parse(fenced.slice(start, end + 1));
}

function describeIssues(error: z.ZodError) {
  return error.issues
    .slice(0, 12)
    .map((issue) => `- ${issue.path.join(".") || "(raíz)"}: ${issue.message}`)
    .join("\n");
}

/**
 * Pide JSON a un modelo de NVIDIA y lo valida con zod. Si no cumple el
 * esquema, le devuelve los errores concretos una vez para que lo corrija:
 * casi siempre son detalles (un campo nulo, un número como texto).
 */
export async function generateJson<T>({
  provider,
  modelId,
  schema,
  system,
  prompt,
  abortSignal,
  history = [],
  promptSchema,
  maxOutputTokens = 5000,
}: {
  provider: Provider;
  modelId: string;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  abortSignal: AbortSignal;
  /** Turnos anteriores de la conversación, del más antiguo al más reciente. */
  history?: ModelMessage[];
  /** Formato que se describe al modelo cuando `schema` tiene transformaciones. */
  promptSchema?: z.ZodType;
  maxOutputTokens?: number;
}): Promise<T> {
  const messages: ModelMessage[] = [...history, { role: "user", content: prompt }];
  let lastProblem = "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { text } = await generateText({
      model: provider.chatModel(modelId),
      system: `${system}\n\n${jsonInstruction(promptSchema ?? schema)}`,
      messages,
      maxOutputTokens,
      temperature: 0.2,
      maxRetries: 0,
      abortSignal,
      // Sin response_format: no todos los modelos de NVIDIA lo aceptan. El
      // esquema va en el prompt y extractJson tolera texto alrededor.
      providerOptions: { nvidia: NVIDIA_NO_THINKING },
    });

    if (process.env.DEBUG_ASSISTANT) console.log("CRUDO", modelId, text.slice(0, 1500));
    let candidate: unknown;
    try {
      candidate = extractJson(text);
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : "JSON no válido";
      messages.push(
        { role: "assistant", content: text },
        { role: "user", content: `Eso no es un JSON válido (${lastProblem}). Devuelve solo el objeto JSON completo.` },
      );
      continue;
    }

    const result = schema.safeParse(candidate);
    if (result.success) return result.data;

    lastProblem = describeIssues(result.error);
    console.warn(`Modelo ${modelId}: respuesta con errores de esquema (intento ${attempt + 1}):\n${lastProblem}`);
    messages.push(
      { role: "assistant", content: text },
      {
        role: "user",
        content: `El JSON no cumple el esquema. Corrige exactamente estos puntos y devuelve el objeto completo:\n${lastProblem}`,
      },
    );
  }

  throw new InvalidModelOutputError(lastProblem.slice(0, 300));
}

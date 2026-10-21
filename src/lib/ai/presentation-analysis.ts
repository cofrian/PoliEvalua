import "server-only";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output } from "ai";

import {
  presentationInsightsSchema,
  type PresentationInsights,
} from "@/lib/ai/presentation-insights";

const SYSTEM_PROMPT = `Eres un asistente académico de la Universitat Politècnica de València.
Analizas la transcripción de una exposición sin inventar información y produces materiales de apoyo.
Escribe en español claro y conserva los nombres técnicos que aparezcan en el texto.
No evalúes, no asignes notas y no decidas ganadores.
Si una tarea o conclusión no está respaldada por la transcripción, no la incluyas.
El mapa mental debe ser breve, jerárquico y útil para repasar la exposición.`;

export async function analyzePresentation({
  transcript,
  teamName,
  projectTitle,
}: {
  transcript: string;
  teamName: string;
  projectTitle: string | null;
}): Promise<PresentationInsights | null> {
  const apiKey = process.env.NVIDIA_API_KEY;
  const modelId = process.env.NVIDIA_MODEL;
  if (!apiKey || !modelId) return null;

  const provider = createOpenAICompatible({
    name: "nvidia",
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey,
    supportsStructuredOutputs: true,
  });

  const { output } = await generateText({
    model: provider.chatModel(modelId),
    output: Output.object({ schema: presentationInsightsSchema }),
    system: SYSTEM_PROMPT,
    prompt: `Equipo o proyecto: ${teamName}\nTítulo: ${projectTitle ?? "Sin título"}\n\nTranscripción:\n${transcript}`,
    maxOutputTokens: 4000,
    temperature: 0.15,
  });

  return output;
}


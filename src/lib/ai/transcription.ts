import "server-only";

import { spawn } from "node:child_process";

// Whisper large-v3 (no turbo: acierta más nombres y términos casi al mismo
// tiempo) alojado en Groq (API compatible con OpenAI, plan gratuito con cupo
// por hora y por día). Si no está configurado o se agota, el trozo pasa al
// trabajador Whisper propio (Kaggle, Colab o PC).
const GROQ_ASR_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_ASR_MODEL = process.env.GROQ_ASR_MODEL || "whisper-large-v3";

/** Error del proveedor con la información necesaria para decidir el reintento. */
export class TranscriptionError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly unsupportedFormat = false,
    /** Segundos que pide esperar el proveedor antes de repetir (cupo lleno). */
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

function providerMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  if ("detail" in payload && typeof payload.detail === "string") {
    return payload.detail;
  }
  if (
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return null;
}

/** Convierte cualquier audio a WAV 16 kHz mono (formato que todo ASR acepta). */
export async function convertToWav(audio: Blob): Promise<Blob> {
  const { default: ffmpegPath } = (await import("ffmpeg-static")) as {
    default: string | null;
  };
  if (!ffmpegPath) throw new TranscriptionError("ffmpeg no está disponible.", false);

  const input = Buffer.from(await audio.arrayBuffer());
  const output = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(ffmpegPath, [
      "-hide_banner", "-loglevel", "error",
      "-i", "pipe:0",
      "-ac", "1", "-ar", "16000", "-f", "wav", "pipe:1",
    ]);
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new TranscriptionError(`ffmpeg terminó con código ${code}.`, false)),
    );
    child.stdin.end(input);
  });
  return new Blob([new Uint8Array(output)], { type: "audio/wav" });
}

async function requestTranscription(
  audio: Blob,
  fileName: string,
  apiKey: string,
  language: string,
  prompt: string | null,
) {
  const form = new FormData();
  form.append("model", GROQ_ASR_MODEL);
  form.append("language", language);
  form.append("response_format", "json");
  form.append("temperature", "0");
  // Pista de vocabulario (equipo, título, rúbrica): mejora nombres propios.
  if (prompt) form.append("prompt", prompt);
  form.append("file", audio, fileName);

  let response: Response;
  try {
    response = await fetch(process.env.GROQ_ASR_URL || GROQ_ASR_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new TranscriptionError(
      error instanceof Error ? `Groq no responde: ${error.message}` : "Groq no responde.",
      true,
    );
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const detail = providerMessage(payload) ?? `HTTP ${response.status}`;
    const retryable = response.status === 429 || response.status >= 500;
    const unsupportedFormat =
      [400, 415, 422].includes(response.status) &&
      /format|codec|decode|unsupported|wav|audio/i.test(detail);
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new TranscriptionError(
      `Groq: ${detail}`,
      retryable,
      unsupportedFormat,
      response.status === 429 && Number.isFinite(retryAfter) ? retryAfter : undefined,
    );
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("text" in payload) ||
    typeof payload.text !== "string"
  ) {
    throw new TranscriptionError("Groq no devolvió una transcripción válida.", true);
  }
  return payload.text.trim();
}

export function groqConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}

/**
 * Transcribe con Whisper en Groq. Si rechaza el formato, convierte a WAV y
 * repite una sola vez.
 */
export async function transcribeWithGroq({
  audio,
  fileName,
  language,
  prompt = null,
}: {
  audio: Blob;
  fileName: string;
  language: string;
  prompt?: string | null;
}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new TranscriptionError("Falta configurar GROQ_API_KEY en el servidor.", false);
  }

  const alreadyWav = audio.type === "audio/wav" || fileName.endsWith(".wav");
  try {
    return await requestTranscription(audio, fileName, apiKey, language, prompt);
  } catch (error) {
    if (error instanceof TranscriptionError && error.unsupportedFormat && !alreadyWav) {
      return requestTranscription(await convertToWav(audio), `${fileName}.wav`, apiKey, language, prompt);
    }
    throw error;
  }
}

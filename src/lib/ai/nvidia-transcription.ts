import "server-only";

import { spawn } from "node:child_process";

const DEFAULT_NVIDIA_ASR_URL =
  "https://a9eeee8f-b509-4712-b19d-194361fa5f31.invocation.api.nvcf.nvidia.com/v1/audio/transcriptions";

/** Error del proveedor con la información necesaria para decidir el reintento. */
export class TranscriptionError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly unsupportedFormat = false,
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

async function requestTranscription(audio: Blob, fileName: string, apiKey: string) {
  const form = new FormData();
  form.append("language", process.env.NVIDIA_ASR_LANGUAGE || "es-US");
  form.append("response_format", "json");
  form.append("file", audio, fileName);

  let response: Response;
  try {
    response = await fetch(process.env.NVIDIA_ASR_URL || DEFAULT_NVIDIA_ASR_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new TranscriptionError(
      error instanceof Error ? `NVIDIA no responde: ${error.message}` : "NVIDIA no responde.",
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
    throw new TranscriptionError(`NVIDIA: ${detail}`, retryable, unsupportedFormat);
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("text" in payload) ||
    typeof payload.text !== "string"
  ) {
    throw new TranscriptionError("NVIDIA no devolvió una transcripción válida.", true);
  }
  return payload.text.trim();
}

/**
 * Transcribe con NVIDIA. Si el servicio rechaza el formato (p. ej. Opus),
 * convierte a WAV y repite una sola vez.
 */
export async function transcribeWithNvidia({
  audio,
  fileName,
}: {
  audio: Blob;
  fileName: string;
}) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new TranscriptionError("Falta configurar NVIDIA_API_KEY en el servidor.", false);
  }

  const alreadyWav = audio.type === "audio/wav" || fileName.endsWith(".wav");
  if (process.env.NVIDIA_ASR_FORCE_WAV === "true" && !alreadyWav) {
    return requestTranscription(await convertToWav(audio), `${fileName}.wav`, apiKey);
  }
  try {
    return await requestTranscription(audio, fileName, apiKey);
  } catch (error) {
    if (error instanceof TranscriptionError && error.unsupportedFormat && !alreadyWav) {
      return requestTranscription(await convertToWav(audio), `${fileName}.wav`, apiKey);
    }
    throw error;
  }
}

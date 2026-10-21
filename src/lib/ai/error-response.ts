import "server-only";

import { NextResponse } from "next/server";

import { AiConfigError, AllModelsFailedError } from "@/lib/ai/models";

/** Traduce un fallo de IA a una respuesta comprensible para quien la usa. */
export function aiErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof AiConfigError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof AllModelsFailedError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.retryable ? 503 : 502 },
    );
  }
  console.error(
    "Error inesperado de IA:",
    error instanceof Error ? error.message : "Error desconocido",
  );
  return NextResponse.json({ error: fallbackMessage }, { status: 502 });
}

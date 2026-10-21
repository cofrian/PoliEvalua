// Configuración de la grabación de exposiciones de un espacio
// (events.settings.recording) y el aviso que deben confirmar sus miembros.

export const DEFAULT_RECORDING_NOTICE =
  "Las exposiciones de este espacio se grabarán para transcribirlas automáticamente y preparar un resumen y materiales de apoyo para la evaluación. El audio no se guarda: se borra en cuanto se convierte en texto. Se conservan solo la transcripción y los materiales generados, que ven únicamente las personas autorizadas del espacio.";

/** Frase que el aviso siempre incluye, aunque la gestión personalice el texto. */
export const NO_AUDIO_GUARANTEE =
  "El audio no se conserva: se borra en cuanto se transcribe.";

export type RecordingSettings = {
  enabled: boolean;
  noticeVersion: number;
  noticeText: string;
  customText: string | null;
};

export function recordingSettings(settings: unknown): RecordingSettings {
  const recording =
    settings && typeof settings === "object" && "recording" in settings
      ? (settings.recording as Record<string, unknown> | null)
      : null;
  const customText =
    typeof recording?.notice_text === "string" && recording.notice_text.trim()
      ? recording.notice_text.trim()
      : null;
  return {
    enabled: recording?.enabled === true,
    noticeVersion: Number(recording?.notice_version) || 0,
    noticeText: customText ?? DEFAULT_RECORDING_NOTICE,
    customText,
  };
}

/** ¿Debe esta persona ver (y confirmar) el aviso antes de usar el espacio? */
export function needsRecordingNotice(
  settings: RecordingSettings,
  acknowledgedVersion: number | null | undefined,
) {
  return settings.enabled && (acknowledgedVersion ?? -1) < settings.noticeVersion;
}

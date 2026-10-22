"use client";

import {
  AudioLines,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  FileAudio,
  FileText,
  Gavel,
  Lightbulb,
  ListTree,
  LoaderCircle,
  Lock,
  Mic,
  Play,
  RotateCw,
  Sparkles,
  Square,
  Trash2,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSegmentedRecorder, type RecordedSegment } from "@/hooks/use-segmented-recorder";
import type { CriterionEvidence, PresentationInsights } from "@/lib/ai/presentation-insights";
import {
  createRecording,
  finalizeRecording,
  markStopped,
  pendingUploads,
  resumeUpload,
  segmentKey,
  uploadSegment,
} from "@/lib/app/segment-upload";
import type { PendingRecording } from "@/lib/app/segment-store";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type PresentationStatus =
  | "uploading"
  | "uploaded"
  | "queued"
  | "transcribing"
  | "transcribed"
  | "analyzing"
  | "ready"
  | "failed"
  | "inactive";

export type PresentationSegment = {
  seq: number;
  status: "uploading" | "queued" | "transcribing" | "done" | "failed";
  transcript: string | null;
};

export type PresentationRecord = {
  id: string;
  title: string;
  status: PresentationStatus;
  visibility: "private" | "event";
  duration_seconds: number;
  size_bytes: number;
  segments_expected: number | null;
  transcript: string | null;
  summary: string | null;
  key_points: string[];
  outline: PresentationInsights["outline"];
  action_items: string[];
  mind_map: PresentationInsights["mindMap"] | null;
  error_message: string | null;
  audio_deleted_at: string | null;
  created_at: string;
  created_by: string;
  creator: { full_name: string } | null;
  segments: PresentationSegment[];
};

export type JuryReportRecord = {
  recording_id: string;
  criteria_evidence: CriterionEvidence[];
  questions: string[];
  risks: string[];
};

const MAX_SECONDS = 60 * 60;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const FILE_TYPES: Record<string, string> = {
  "audio/webm": "audio/webm",
  "audio/ogg": "audio/ogg",
  "audio/mp4": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/mpeg": "audio/mpeg",
  "audio/mp3": "audio/mpeg",
  "audio/wav": "audio/wav",
  "audio/x-wav": "audio/wav",
};

const statusLabels: Record<PresentationStatus, string> = {
  uploading: "Grabando / subiendo",
  uploaded: "Audio subido",
  queued: "En cola",
  transcribing: "Transcribiendo",
  transcribed: "Texto listo",
  analyzing: "Agentes analizando",
  ready: "Análisis listo",
  failed: "Requiere atención",
  inactive: "Retirada",
};

const coverageLabels: Record<CriterionEvidence["coverage"], string> = {
  clear: "Tratado con claridad",
  partial: "Tratado en parte",
  absent: "No se menciona",
};

/** Los errores de getUserMedia llegan en inglés y con nombres técnicos. */
function microphoneErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "El navegador no tiene permiso para usar el micrófono. Actívalo en el candado de la barra de direcciones y vuelve a intentarlo.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No se ha encontrado ningún micrófono. Conecta uno y vuelve a intentarlo.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "El micrófono está ocupado por otra aplicación (Teams, Zoom…). Ciérrala y vuelve a intentarlo.";
  }
  return error instanceof Error && error.message
    ? error.message
    : "No se ha podido empezar a grabar. Revisa el micrófono y vuelve a intentarlo.";
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function audioDuration(file: File) {
  return new Promise<number>((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    audio.src = url;
  });
}

function MindMap({ map }: { map: PresentationInsights["mindMap"] }) {
  const branchColors = [
    "border-t-upv-yellow",
    "border-t-upv-blue",
    "border-t-upv-red",
    "border-t-leaf-500",
  ];

  return (
    <div className="rounded-2xl bg-[radial-gradient(circle_at_top,var(--accent),transparent_58%)] p-4 sm:p-6">
      <div className="mx-auto mb-5 w-fit rounded-2xl bg-upv-900 px-5 py-3 text-center text-sm font-bold text-white shadow-lg dark:bg-upv-yellow dark:text-upv-ink">
        {map.title}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {map.branches.map((branch, index) => (
          <section
            className={cn(
              "rounded-xl border border-border border-t-4 bg-card p-4 shadow-sm",
              branchColors[index % branchColors.length],
            )}
            key={`${branch.title}-${index}`}
          >
            <h4 className="mb-2 font-display text-sm">{branch.title}</h4>
            <ul className="space-y-1.5 text-xs leading-5 text-muted-foreground">
              {branch.items.map((item, itemIndex) => (
                <li className="flex gap-2" key={`${item}-${itemIndex}`}>
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-upv-blue" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function Waveform({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!analyser) return;
    let frame = 0;
    const values = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
        canvas.width = width * ratio;
        canvas.height = height * ratio;
      }
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      analyser.getByteTimeDomainData(values);
      context.lineWidth = 3;
      context.strokeStyle = "#ffd100";
      context.beginPath();
      const step = width / values.length;
      for (let index = 0; index < values.length; index += 1) {
        const x = index * step;
        const y = (values[index] / 255) * height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [analyser]);

  return (
    <canvas
      aria-label="Forma de onda del micrófono"
      className="h-24 w-full"
      ref={canvasRef}
      role="img"
    />
  );
}

function JuryReport({ report }: { report: JuryReportRecord }) {
  return (
    <section className="rounded-2xl border-2 border-upv-blue/40 bg-upv-blue/5 p-4 sm:p-5">
      <h4 className="flex items-center gap-2 font-display text-lg">
        <Gavel className="size-5" /> Para el jurado
      </h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Solo lo ven el jurado y la gestión. Las citas están comprobadas contra la
        transcripción; no es una nota ni una recomendación de voto.
      </p>

      {report.criteria_evidence.length ? (
        <div className="mt-4 space-y-3">
          {report.criteria_evidence.map((item, index) => (
            <article className="rounded-xl bg-card p-3 shadow-sm" key={`${item.criterion}-${index}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">{item.criterion}</p>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-bold",
                    item.coverage === "clear" && "bg-leaf-500/15 text-leaf-500",
                    item.coverage === "partial" && "bg-upv-yellow/25",
                    item.coverage === "absent" && "bg-muted text-muted-foreground",
                  )}
                >
                  {coverageLabels[item.coverage]}
                </span>
              </div>
              {item.evidence.length ? (
                <ul className="mt-2 space-y-2 text-sm">
                  {item.evidence.map((entry, entryIndex) => (
                    <li key={`${entry.quote}-${entryIndex}`}>
                      <blockquote className="border-l-2 border-upv-blue pl-3 italic">
                        «{entry.quote}»
                      </blockquote>
                      <p className="mt-1 pl-3 text-xs text-muted-foreground">{entry.explanation}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h5 className="mb-2 font-bold">Preguntas sugeridas</h5>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            {report.questions.map((question, index) => (
              <li key={`${question}-${index}`}>{question}</li>
            ))}
          </ol>
        </div>
        {report.risks.length ? (
          <div>
            <h5 className="mb-2 font-bold">Puntos a aclarar</h5>
            <ul className="space-y-1.5 text-sm">
              {report.risks.map((risk, index) => (
                <li className="flex gap-2" key={`${risk}-${index}`}>
                  <span aria-hidden>⚠️</span> {risk}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function progressText(record: PresentationRecord) {
  const done = record.segments.filter((segment) => segment.status === "done").length;
  const total = record.segments_expected ?? record.segments.length;
  if (record.status === "analyzing") return "Los agentes están creando resumen, esquema, mapa mental e informe…";
  if (record.status === "uploading") return `Recibiendo audio: ${done}/${total} partes ya transcritas.`;
  if (record.status === "queued" && done === 0) return "En cola: se procesará en cuanto haya hueco.";
  return `Transcribiendo: ${done}/${total} partes listas.`;
}

export function PresentationStudio({
  teamId,
  userId,
  canCreate,
  canManage,
  initialRecords,
  juryReports,
  recordingDisabledReason = null,
}: {
  teamId: string;
  userId: string;
  canCreate: boolean;
  canManage: boolean;
  /** Si se indica, explica por qué no se puede grabar (en lugar del mensaje de consulta). */
  recordingDisabledReason?: string | null;
  initialRecords: PresentationRecord[];
  juryReports: JuryReportRecord[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const recordingIdRef = useRef<string | null>(null);
  const uploadsRef = useRef<Promise<void>[]>([]);
  const sizeRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [liveRecordingId, setLiveRecordingId] = useState<string | null>(null);
  const [title, setTitle] = useState("Nueva exposición");
  const [visibility, setVisibility] = useState<"private" | "event">("private");
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [failedUploads, setFailedUploads] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [manualTranscripts, setManualTranscripts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ recording: PendingRecording; segments: number }[]>([]);

  const reportsById = useMemo(
    () => new Map(juryReports.map((report) => [report.recording_id, report])),
    [juryReports],
  );

  const handleSegment = useCallback(
    (segment: RecordedSegment) => {
      const recordingId = recordingIdRef.current;
      if (!recordingId) return;
      sizeRef.current += segment.blob.size;
      const upload = uploadSegment(supabase, {
        key: segmentKey(recordingId, segment.seq),
        recordingId,
        ...segment,
      })
        .then(() => setUploaded((count) => count + 1))
        .catch(() => {
          // El segmento sigue en IndexedDB: se podrá reanudar la subida.
          setFailedUploads((count) => count + 1);
        });
      uploadsRef.current.push(upload);
    },
    [supabase],
  );

  // stopRecording se declara más abajo; el hook la invoca a través de esta referencia.
  const stopRef = useRef<() => Promise<void>>(async () => undefined);
  const handleFinishRequired = useCallback((reason: "limit" | "interrupted") => {
    if (reason === "limit") {
      toast.info("Se ha alcanzado la duración máxima. Guardando la grabación…");
    } else {
      toast.warning(
        "El micrófono se ha desconectado o lo ha usado otra aplicación. Guardamos lo grabado hasta ahora.",
      );
    }
    void stopRef.current();
  }, []);

  const recorder = useSegmentedRecorder({
    maxSeconds: MAX_SECONDS,
    onSegment: handleSegment,
    onFinishRequired: handleFinishRequired,
  });

  // Salir de la página corta el micrófono y deja trozos sin subir.
  const leaveRisk = recorder.isRecording || busy;
  useEffect(() => {
    if (!leaveRisk) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [leaveRisk]);

  const refreshPending = useCallback(async () => {
    const items = await pendingUploads();
    setPending(
      items
        .filter((item) => item.recording.recordingId !== recordingIdRef.current)
        .map((item) => ({ recording: item.recording, segments: item.segments.length })),
    );
  }, []);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  // La cola trabaja fuera de esta pestaña: refrescamos al cambiar el estado.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        router.refresh();
      }, 800);
    };
    const channel = supabase
      .channel(`presentations:${teamId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "presentation_recordings",
          filter: `team_id=eq.${teamId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "presentation_segments" },
        refresh,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [router, supabase, teamId]);

  async function startRecording() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const id = await createRecording({ teamId, title: title.trim(), visibility });
      recordingIdRef.current = id;
      setLiveRecordingId(id);
      uploadsRef.current = [];
      sizeRef.current = 0;
      setUploaded(0);
      setFailedUploads(0);
      await recorder.start();
      router.refresh();
    } catch (error) {
      const recordingId = recordingIdRef.current;
      recordingIdRef.current = null;
      setLiveRecordingId(null);
      // La grabación ya existe en el servidor pero sin audio: se retira.
      if (recordingId) {
        void fetch(`/api/presentations/${recordingId}`, { method: "DELETE" }).catch(() => undefined);
      }
      toast.error(microphoneErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function stopRecording() {
    const recordingId = recordingIdRef.current;
    setBusy(true);
    try {
      const result = await recorder.stop();
      if (!recordingId || !result) return;
      await Promise.all(uploadsRef.current);
      const saved = await markStopped(recordingId, {
        segmentsExpected: result.segments,
        durationSeconds: result.durationSeconds,
        sizeBytes: sizeRef.current,
      });
      if (await finalizeRecording(saved)) {
        toast.success("Grabación completa. El texto y los materiales aparecerán aquí.");
        setTitle("Nueva exposición");
      } else {
        toast.warning(
          "Parte del audio no se ha podido subir. Está guardado en este navegador: pulsa «Reanudar subida».",
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cerrar la grabación.");
    } finally {
      recordingIdRef.current = null;
      setLiveRecordingId(null);
      setBusy(false);
      void refreshPending();
      router.refresh();
    }
  }

  useEffect(() => {
    stopRef.current = stopRecording;
  });

  async function uploadFile(file: File) {
    const mimeType = FILE_TYPES[file.type];
    if (!mimeType) {
      toast.error("Formato no admitido. Usa MP3, M4A, WAV, OGG o WEBM.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("El archivo supera 20 MB. Expórtalo en MP3 o M4A para que ocupe menos.");
      return;
    }
    setBusy(true);
    try {
      const seconds = Math.max(1, Math.round(await audioDuration(file)));
      const id = await createRecording({
        teamId,
        title: title.trim() || file.name.slice(0, 160),
        visibility,
      });
      await uploadSegment(supabase, {
        key: segmentKey(id, 0),
        recordingId: id,
        seq: 0,
        startMs: 0,
        endMs: seconds * 1000,
        mimeType,
        blob: file,
      });
      const saved = await markStopped(id, {
        segmentsExpected: 1,
        durationSeconds: seconds,
        sizeBytes: file.size,
      });
      await finalizeRecording(saved);
      toast.success("Archivo subido. Lo estamos transcribiendo.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo subir el archivo.");
      void refreshPending();
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function resume(recording: PendingRecording) {
    setActiveId(recording.recordingId);
    try {
      const finished = await resumeUpload(supabase, recording);
      toast.success(
        finished
          ? "Subida completada. Ya se está transcribiendo."
          : "Audio subido. La grabación se cerrará cuando termines de grabar.",
      );
    } catch {
      toast.error("Sigue sin haber conexión. Inténtalo de nuevo en un momento.");
    } finally {
      setActiveId(null);
      void refreshPending();
      router.refresh();
    }
  }

  async function processRecord(record: PresentationRecord, useManual: boolean) {
    const transcript = useManual
      ? (manualTranscripts[record.id] ?? record.transcript ?? "").trim()
      : undefined;
    if (useManual && (!transcript || transcript.length < 20)) {
      toast.error("Pega al menos 20 caracteres de transcripción.");
      return;
    }
    setActiveId(record.id);
    try {
      const response = await fetch(`/api/presentations/${record.id}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transcript ? { transcript } : {}),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo procesar.");
      toast.success("Vuelto a poner en cola.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo procesar.");
    } finally {
      setActiveId(null);
    }
  }

  async function retireRecord(record: PresentationRecord) {
    if (!window.confirm("¿Retirar esta grabación? Dejará de aparecer en la biblioteca.")) return;
    setActiveId(record.id);
    try {
      const response = await fetch(`/api/presentations/${record.id}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo retirar.");
      toast.success("Grabación retirada.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo retirar.");
    } finally {
      setActiveId(null);
    }
  }

  const liveRecord = initialRecords.find((record) => record.id === liveRecordingId);
  const liveText = liveRecord?.segments
    .filter((segment) => segment.status === "done" && segment.transcript)
    .map((segment) => segment.transcript)
    .join(" ");

  return (
    <div className="space-y-8">
      {pending.length ? (
        <section className="rounded-2xl border border-upv-yellow bg-upv-yellow/10 p-4">
          <h3 className="font-display">Subidas pendientes en este navegador</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Se cortó la conexión mientras grababas. El audio está guardado aquí; súbelo para no perderlo.
          </p>
          <ul className="mt-3 space-y-2">
            {pending.map(({ recording, segments }) => (
              <li className="flex flex-wrap items-center justify-between gap-2" key={recording.recordingId}>
                <span className="text-sm font-semibold">
                  {recording.title || "Grabación"} · {segments} parte(s) sin subir
                </span>
                <Button
                  disabled={activeId === recording.recordingId}
                  onClick={() => void resume(recording)}
                  size="sm"
                  type="button"
                >
                  <RotateCw /> Reanudar subida
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="relative overflow-hidden rounded-3xl bg-upv-900 p-5 text-white shadow-xl sm:p-8 dark:bg-card">
        <div className="pointer-events-none absolute -right-14 -top-14 size-52 rounded-full bg-upv-yellow/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/4 size-56 rounded-full bg-upv-blue/20 blur-3xl" />
        <div className="relative grid gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold">
              <Sparkles className="size-4 text-upv-yellow" /> Estudio de exposición
            </div>
            <h2 className="font-display text-2xl tracking-tight sm:text-3xl">De la voz a las ideas</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">
              El audio se sube por partes mientras grabas y se transcribe a la vez.
              Al terminar, unos agentes crean resumen, esquema, mapa mental y un
              informe para el jurado. La voz se borra en cuanto hay texto.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/70">
              <span className="rounded-full bg-white/10 px-3 py-1">Subida por partes</span>
              <span className="rounded-full bg-white/10 px-3 py-1">Hasta 60 min</span>
              <span className="rounded-full bg-white/10 px-3 py-1">Sin guardar la voz</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-black/20 p-4 backdrop-blur sm:p-5">
            {canCreate ? (
              <>
                {!recorder.isRecording ? (
                  <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div className="space-y-1.5">
                      <Label className="text-white/80" htmlFor="presentation-title">
                        Nombre de la exposición
                      </Label>
                      <Input
                        className="border-white/20 bg-white/10 text-white"
                        id="presentation-title"
                        maxLength={160}
                        onChange={(event) => setTitle(event.target.value)}
                        value={title}
                      />
                    </div>
                    <button
                      aria-pressed={visibility === "event"}
                      className="flex h-9 items-center justify-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-semibold hover:bg-white/10"
                      onClick={() =>
                        setVisibility((current) => (current === "private" ? "event" : "private"))
                      }
                      type="button"
                    >
                      {visibility === "private" ? (
                        <><Lock className="size-4" /> Solo yo</>
                      ) : (
                        <><Users className="size-4" /> Todo el espacio</>
                      )}
                    </button>
                  </div>
                ) : null}

                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-3 rounded-full",
                        recorder.isRecording ? "animate-pulse bg-upv-red" : "bg-white/30",
                      )}
                    />
                    <span className="font-mono text-2xl font-bold tabular-nums">
                      {formatDuration(recorder.elapsedSeconds)}
                    </span>
                  </div>
                  {recorder.isRecording ? (
                    <span className="text-xs text-white/70">
                      {recorder.segmentCount} parte(s) · {uploaded} subida(s)
                      {failedUploads ? ` · ${failedUploads} pendiente(s)` : ""}
                    </span>
                  ) : (
                    <span className="text-xs text-white/60">{formatDuration(MAX_SECONDS)}</span>
                  )}
                </div>
                {recorder.isRecording ? (
                  <Waveform analyser={recorder.analyser} />
                ) : (
                  <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-white/20 text-white/55">
                    <AudioLines className="mr-2 size-5" /> Pon el móvil cerca de quien expone
                  </div>
                )}
                {recorder.isRecording && !recorder.wakeLockActive ? (
                  <p className="mt-2 text-xs text-upv-yellow">
                    No bloquees la pantalla mientras grabas: este navegador no puede mantenerla encendida.
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {recorder.isRecording ? (
                    <Button
                      className="h-12 rounded-full bg-upv-red px-6 text-white hover:bg-upv-red/85"
                      disabled={busy}
                      onClick={() => void stopRecording()}
                      type="button"
                    >
                      <Square className="size-4 fill-current" /> Terminar exposición
                    </Button>
                  ) : (
                    <>
                      <Button
                        className="h-12 rounded-full bg-upv-yellow px-6 font-bold text-upv-ink hover:bg-upv-yellow/85"
                        disabled={busy || !title.trim()}
                        onClick={() => void startRecording()}
                        type="button"
                      >
                        {busy ? <LoaderCircle className="size-5 animate-spin" /> : <Mic className="size-5" />}
                        Empezar a grabar
                      </Button>
                      <Button
                        className="h-12 rounded-full border-white/30 bg-transparent text-white hover:bg-white/10"
                        disabled={busy}
                        onClick={() => fileInputRef.current?.click()}
                        type="button"
                        variant="outline"
                      >
                        <FileAudio className="size-5" /> Subir archivo
                      </Button>
                      <input
                        accept="audio/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadFile(file);
                        }}
                        ref={fileInputRef}
                        type="file"
                      />
                    </>
                  )}
                </div>
                {recorder.isRecording && liveText ? (
                  <p className="mt-4 max-h-28 overflow-y-auto rounded-xl bg-black/25 p-3 text-xs leading-5 text-white/80">
                    {liveText}
                  </p>
                ) : null}
              </>
            ) : (
              <div className="flex min-h-40 items-center justify-center text-center text-sm text-white/70">
                {recordingDisabledReason ??
                  "El perfil de consulta puede ver materiales compartidos, pero no grabar."}
              </div>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-muted-foreground uppercase">
              Biblioteca del proyecto
            </p>
            <h2 className="font-display text-xl">Exposiciones</h2>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold">
            {initialRecords.length}
          </span>
        </div>

        {initialRecords.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-14 text-center">
            <Mic className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="font-display">Todavía no hay exposiciones</p>
            <p className="mt-1 text-sm text-muted-foreground">
              La primera grabación aparecerá aquí con todos sus materiales.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {initialRecords.map((record, index) => {
              const mine = record.created_by === userId;
              const processing =
                activeId === record.id ||
                ["uploading", "queued", "transcribing", "analyzing"].includes(record.status);
              const canEdit = mine || canManage;
              const report = reportsById.get(record.id);
              return (
                <details
                  className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm [content-visibility:auto]"
                  key={record.id}
                  open={index === 0}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
                    <div className="rounded-xl bg-upv-yellow/20 p-2.5">
                      {processing ? (
                        <LoaderCircle className="size-5 animate-spin" />
                      ) : (
                        <AudioLines className="size-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-display text-base sm:text-lg">{record.title}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{record.creator?.full_name ?? "Usuario"}</span>
                        <span><Clock3 className="mr-1 inline size-3" />{formatDuration(record.duration_seconds)}</span>
                        {record.size_bytes ? <span>{formatSize(record.size_bytes)}</span> : null}
                        <span>{record.visibility === "private" ? "🔒 Privada" : "👥 Compartida"}</span>
                      </div>
                    </div>
                    <span className="hidden rounded-full bg-muted px-3 py-1 text-xs font-bold sm:inline">
                      {statusLabels[record.status]}
                    </span>
                  </summary>

                  <div className="space-y-6 border-t border-border p-4 sm:p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Lock className="size-3.5" />
                        {record.audio_deleted_at
                          ? "Audio eliminado tras la transcripción."
                          : "Audio temporal: se eliminará al obtener el texto."}
                      </p>
                      {canEdit ? (
                        <Button
                          aria-label="Retirar grabación"
                          disabled={activeId === record.id}
                          onClick={() => void retireRecord(record)}
                          type="button"
                          variant="destructive"
                        >
                          <Trash2 /> Retirar
                        </Button>
                      ) : null}
                    </div>

                    {record.error_message ? (
                      <p className="rounded-xl border border-upv-red/30 bg-upv-red/5 p-3 text-sm">
                        {record.error_message}
                      </p>
                    ) : null}

                    {processing ? (
                      <div className="flex items-center gap-3 rounded-xl bg-muted p-4 text-sm">
                        <LoaderCircle className="size-5 shrink-0 animate-spin" />
                        {progressText(record)}
                      </div>
                    ) : null}

                    {record.summary ? (
                      <div className="grid gap-4 lg:grid-cols-2">
                        <section className="rounded-xl bg-muted/70 p-4">
                          <h4 className="mb-2 flex items-center gap-2 font-display">
                            <FileText className="size-4" /> Resumen
                          </h4>
                          <p className="text-sm leading-6 whitespace-pre-wrap">{record.summary}</p>
                        </section>
                        <section className="rounded-xl bg-upv-yellow/10 p-4">
                          <h4 className="mb-2 flex items-center gap-2 font-display">
                            <Lightbulb className="size-4" /> Ideas clave
                          </h4>
                          <ul className="space-y-2 text-sm">
                            {record.key_points.map((point, pointIndex) => (
                              <li className="flex gap-2" key={`${point}-${pointIndex}`}>
                                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-leaf-500" /> {point}
                              </li>
                            ))}
                          </ul>
                        </section>
                      </div>
                    ) : null}

                    {record.outline.length ? (
                      <section>
                        <h4 className="mb-3 flex items-center gap-2 font-display text-lg">
                          <ListTree className="size-5" /> Esquema de la exposición
                        </h4>
                        <ol className="grid gap-3 sm:grid-cols-2">
                          {record.outline.map((section, sectionIndex) => (
                            <li className="rounded-xl border border-border p-4" key={`${section.heading}-${sectionIndex}`}>
                              <p className="mb-2 font-bold"><span className="mr-2 text-upv-red">{sectionIndex + 1}.</span>{section.heading}</p>
                              <ul className="space-y-1 text-sm text-muted-foreground">
                                {section.bullets.map((bullet, bulletIndex) => (
                                  <li key={`${bullet}-${bulletIndex}`}>• {bullet}</li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ol>
                      </section>
                    ) : null}

                    {record.mind_map ? (
                      <section>
                        <h4 className="mb-3 flex items-center gap-2 font-display text-lg">
                          <BrainCircuit className="size-5" /> Mapa mental
                        </h4>
                        <MindMap map={record.mind_map} />
                      </section>
                    ) : null}

                    {record.action_items.length ? (
                      <section className="rounded-xl border-l-4 border-l-upv-blue bg-muted/50 p-4">
                        <h4 className="mb-2 font-display">Próximos pasos detectados</h4>
                        <ul className="space-y-1 text-sm">
                          {record.action_items.map((item, itemIndex) => (
                            <li key={`${item}-${itemIndex}`}>□ {item}</li>
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    {report ? <JuryReport report={report} /> : null}

                    {record.transcript ? (
                      <details className="rounded-xl border border-border p-4">
                        <summary className="cursor-pointer font-bold">Ver transcripción completa</summary>
                        <p className="mt-4 max-h-96 overflow-y-auto text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
                          {record.transcript}
                        </p>
                      </details>
                    ) : null}

                    {canEdit && !processing && record.status !== "ready" ? (
                      <section className="rounded-xl border border-dashed border-border p-4">
                        <h4 className="font-display">Recuperar o completar el análisis</h4>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Puedes reintentar el procesamiento o pegar un texto corregido para crear los materiales.
                        </p>
                        <Textarea
                          aria-label={`Transcripción manual de ${record.title}`}
                          className="mt-3 min-h-32"
                          onChange={(event) =>
                            setManualTranscripts((current) => ({
                              ...current,
                              [record.id]: event.target.value,
                            }))
                          }
                          placeholder="Pega aquí una transcripción manual o corregida…"
                          value={manualTranscripts[record.id] ?? record.transcript ?? ""}
                        />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            disabled={activeId === record.id}
                            onClick={() => void processRecord(record, true)}
                            type="button"
                          >
                            <Sparkles /> Analizar este texto
                          </Button>
                          {record.status === "transcribed" ||
                          (record.status === "failed" && !record.audio_deleted_at) ? (
                            <Button
                              disabled={activeId === record.id}
                              onClick={() => void processRecord(record, false)}
                              type="button"
                              variant="outline"
                            >
                              <Play /> Reintentar
                            </Button>
                          ) : null}
                        </div>
                      </section>
                    ) : null}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 rounded-xl bg-muted p-3 text-xs leading-5 text-muted-foreground">
        <Lock className="mt-0.5 size-4 shrink-0" />
        El audio solo existe mientras se transcribe, en un contenedor privado, y se borra después. Una grabación privada solo la ve su autor y la gestión del espacio; una compartida, los miembros activos de este espacio. El informe para el jurado solo lo ven jurado y gestión.
      </p>
    </div>
  );
}

"use client";

import {
  AudioLines,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  FileText,
  Lightbulb,
  ListTree,
  LoaderCircle,
  Lock,
  Mic,
  Play,
  Sparkles,
  Square,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PresentationInsights } from "@/lib/ai/presentation-insights";
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

export type PresentationRecord = {
  id: string;
  title: string;
  status: PresentationStatus;
  visibility: "private" | "event";
  duration_seconds: number;
  size_bytes: number;
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
};

type RecorderResources = {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  stream: MediaStream;
  recorder: MediaRecorder;
  chunks: Blob[];
};

const MAX_SECONDS = 20 * 60;
const MAX_BYTES = 50 * 1024 * 1024;
// 32 kbps de Opus conserva la voz sin pérdida apreciable para Whisper.
const AUDIO_BITS_PER_SECOND = 32_000;
const RECORDING_FORMATS = [
  { recorder: "audio/webm;codecs=opus", upload: "audio/webm" },
  { recorder: "audio/ogg;codecs=opus", upload: "audio/ogg" },
  { recorder: "audio/webm", upload: "audio/webm" },
  { recorder: "audio/mp4", upload: "audio/mp4" },
] as const;

const statusLabels: Record<PresentationStatus, string> = {
  uploading: "Subiendo",
  uploaded: "Audio subido",
  queued: "En cola",
  transcribing: "Transcribiendo",
  transcribed: "Texto listo",
  analyzing: "Creando materiales",
  ready: "Análisis listo",
  failed: "Requiere atención",
  inactive: "Retirada",
};

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function pickRecordingFormat() {
  if (typeof MediaRecorder === "undefined") return null;
  return (
    RECORDING_FORMATS.find((format) =>
      MediaRecorder.isTypeSupported(format.recorder),
    ) ?? null
  );
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

export function PresentationStudio({
  teamId,
  userId,
  canCreate,
  canManage,
  initialRecords,
}: {
  teamId: string;
  userId: string;
  canCreate: boolean;
  canManage: boolean;
  initialRecords: PresentationRecord[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const resourcesRef = useRef<RecorderResources | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const uploadMimeRef = useRef<string>("audio/webm");
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("Nueva exposición");
  const [visibility, setVisibility] = useState<"private" | "event">("private");
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [manualTranscripts, setManualTranscripts] = useState<Record<string, string>>({});

  const releaseResources = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const resources = resourcesRef.current;
    resourcesRef.current = null;
    if (!resources) return;
    if (resources.recorder.state !== "inactive") resources.recorder.stop();
    resources.source.disconnect();
    resources.analyser.disconnect();
    resources.stream.getTracks().forEach((track) => track.stop());
    await resources.context.close().catch(() => undefined);
  }, []);

  const stopRecording = useCallback(async () => {
    const resources = resourcesRef.current;
    if (!resources) return;
    const stopped = new Promise<void>((resolve) => {
      resources.recorder.addEventListener("stop", () => resolve(), { once: true });
    });
    resources.recorder.stop();
    await stopped;
    const blob = new Blob(resources.chunks, { type: uploadMimeRef.current });
    setIsRecording(false);
    setAnalyser(null);
    await releaseResources();
    if (blob.size > MAX_BYTES) {
      toast.error("La grabación supera 50 MB. Haz una toma más corta.");
      setAudioBlob(null);
      return;
    }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(blob);
    previewUrlRef.current = url;
    setPreviewUrl(url);
    setAudioBlob(blob);
  }, [releaseResources]);

  useEffect(() => {
    if (isRecording && seconds >= MAX_SECONDS) {
      toast.info("Se ha alcanzado el máximo de 20 minutos.");
      void stopRecording();
    }
  }, [isRecording, seconds, stopRecording]);

  // La cola trabaja fuera de esta pestaña: refrescamos al cambiar el estado.
  useEffect(() => {
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
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, supabase, teamId]);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      void releaseResources();
    },
    [releaseResources],
  );

  async function startRecording() {
    const format = pickRecordingFormat();
    if (!navigator.mediaDevices?.getUserMedia || !format) {
      toast.error("Este navegador no permite grabar desde el micrófono.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const context = new AudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const analyserNode = context.createAnalyser();
      analyserNode.fftSize = 2048;
      source.connect(analyserNode);
      const recorder = new MediaRecorder(stream, {
        mimeType: format.recorder,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
      const chunks: Blob[] = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      recorder.start(1000);
      uploadMimeRef.current = format.upload;
      resourcesRef.current = {
        context,
        source,
        analyser: analyserNode,
        stream,
        recorder,
        chunks,
      };
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      setPreviewUrl(null);
      setAudioBlob(null);
      setSeconds(0);
      setAnalyser(analyserNode);
      setIsRecording(true);
      timerRef.current = setInterval(
        () => setSeconds((current) => current + 1),
        1000,
      );
    } catch {
      toast.error(
        "No se ha podido acceder al micrófono. Revisa el permiso del navegador.",
      );
    }
  }

  async function uploadAndProcess() {
    if (!audioBlob || !title.trim()) return;
    setBusy(true);
    try {
      const uploadResponse = await fetch("/api/presentations/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          title: title.trim(),
          sizeBytes: audioBlob.size,
          durationSeconds: seconds,
          visibility,
          mimeType: uploadMimeRef.current,
        }),
      });
      const uploadPayload = (await uploadResponse.json()) as {
        id?: string;
        path?: string;
        token?: string;
        error?: string;
      };
      if (!uploadResponse.ok || !uploadPayload.id || !uploadPayload.path || !uploadPayload.token) {
        throw new Error(uploadPayload.error || "No se pudo preparar la subida.");
      }

      const { error: storageError } = await supabase.storage
        .from("presentation-audio")
        .uploadToSignedUrl(uploadPayload.path, uploadPayload.token, audioBlob, {
          contentType: uploadMimeRef.current,
          upsert: false,
        });
      if (storageError) throw new Error("No se pudo guardar el audio privado.");

      toast.success("Audio subido. Lo ponemos en la cola de transcripción…");
      setActiveId(uploadPayload.id);
      const processResponse = await fetch(
        `/api/presentations/${uploadPayload.id}/process`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const processPayload = (await processResponse.json()) as {
        error?: string;
        warning?: string;
        status?: string;
      };
      if (!processResponse.ok) {
        throw new Error(processPayload.error || "No se pudo transcribir el audio.");
      }
      if (processPayload.warning) toast.warning(processPayload.warning);
      else
        toast.success(
          "En cola. Te avisaremos aquí cuando el texto y los materiales estén listos.",
        );

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      setPreviewUrl(null);
      setAudioBlob(null);
      setSeconds(0);
      setTitle("Nueva exposición");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo procesar el audio.");
      router.refresh();
    } finally {
      setBusy(false);
      setActiveId(null);
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
      const payload = (await response.json()) as {
        error?: string;
        warning?: string;
        status?: string;
      };
      if (!response.ok) throw new Error(payload.error || "No se pudo procesar.");
      if (payload.warning) toast.warning(payload.warning);
      else if (payload.status === "queued") toast.success("Grabación devuelta a la cola.");
      else toast.success("Materiales generados.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo procesar.");
      router.refresh();
    } finally {
      setActiveId(null);
    }
  }

  async function retireRecord(record: PresentationRecord) {
    if (!window.confirm("¿Retirar esta grabación? Dejará de aparecer en la biblioteca.")) return;
    setActiveId(record.id);
    try {
      const response = await fetch(`/api/presentations/${record.id}`, {
        method: "DELETE",
      });
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

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-upv-900 p-5 text-white shadow-xl sm:p-8 dark:bg-[#1b1d1e]">
        <div className="pointer-events-none absolute -right-14 -top-14 size-52 rounded-full bg-upv-yellow/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/4 size-56 rounded-full bg-upv-blue/20 blur-3xl" />
        <div className="relative grid gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold">
              <Sparkles className="size-4 text-upv-yellow" /> Estudio de exposición
            </div>
            <h2 className="font-display text-3xl sm:text-4xl">
              De la voz a las ideas
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">
              Graba una presentación y crea automáticamente su transcripción,
              resumen, esquema y mapa mental. El audio se borra al terminar.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/70">
              <span className="rounded-full bg-white/10 px-3 py-1">Opus · ~3 MB cada 15 min</span>
              <span className="rounded-full bg-white/10 px-3 py-1">Máximo 20 min</span>
              <span className="rounded-full bg-white/10 px-3 py-1">Sin guardar la voz</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-black/20 p-4 backdrop-blur sm:p-5">
            {canCreate ? (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-3 rounded-full",
                        isRecording ? "animate-pulse bg-upv-red" : "bg-white/30",
                      )}
                    />
                    <span className="font-mono text-2xl font-bold tabular-nums">
                      {formatDuration(seconds)}
                    </span>
                  </div>
                  <span className="text-xs text-white/60">{formatDuration(MAX_SECONDS)}</span>
                </div>
                {isRecording ? (
                  <Waveform analyser={analyser} />
                ) : (
                  <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-white/20 text-white/55">
                    <AudioLines className="mr-2 size-5" /> El audio aparecerá aquí
                  </div>
                )}
                <div className="mt-4 flex justify-center">
                  {isRecording ? (
                    <Button
                      className="h-12 rounded-full bg-upv-red px-6 text-white hover:bg-upv-red/85"
                      onClick={() => void stopRecording()}
                      type="button"
                    >
                      <Square className="size-4 fill-current" /> Detener grabación
                    </Button>
                  ) : (
                    <Button
                      className="h-12 rounded-full bg-upv-yellow px-6 font-bold text-upv-ink hover:bg-upv-yellow/85"
                      disabled={busy}
                      onClick={() => void startRecording()}
                      type="button"
                    >
                      <Mic className="size-5" /> {audioBlob ? "Grabar de nuevo" : "Empezar a grabar"}
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex min-h-40 items-center justify-center text-center text-sm text-white/70">
                El perfil de consulta puede ver materiales compartidos, pero no grabar.
              </div>
            )}
          </div>
        </div>
      </section>

      {audioBlob && previewUrl ? (
        <section className="rounded-2xl border border-upv-blue/40 bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-upv-blue/15 p-2.5">
              <CheckCircle2 className="size-5 text-upv-700 dark:text-upv-blue" />
            </div>
            <div>
              <h3 className="font-display text-lg">Grabación preparada</h3>
              <p className="text-xs text-muted-foreground">
                {formatDuration(seconds)} · {formatSize(audioBlob.size)}
              </p>
            </div>
          </div>
          <audio className="mb-5 w-full" controls src={previewUrl}>
            Tu navegador no puede reproducir este audio.
          </audio>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="presentation-title">Nombre de la exposición</Label>
              <Input
                id="presentation-title"
                maxLength={160}
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </div>
            <button
              aria-pressed={visibility === "event"}
              className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted"
              onClick={() =>
                setVisibility((current) =>
                  current === "private" ? "event" : "private",
                )
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
          <Button
            className="mt-4 h-11 w-full font-bold sm:w-auto"
            disabled={busy || !title.trim()}
            onClick={() => void uploadAndProcess()}
            type="button"
          >
            {busy ? (
              <><LoaderCircle className="animate-spin" /> Procesando…</>
            ) : (
              <><UploadCloud /> Subir, transcribir y crear materiales</>
            )}
          </Button>
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-muted-foreground uppercase">
              Biblioteca del proyecto
            </p>
            <h2 className="font-display text-2xl">Exposiciones guardadas</h2>
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
                ["queued", "transcribing", "analyzing"].includes(record.status);
              const canEdit = mine || canManage;
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
                        <span>{formatSize(record.size_bytes)}</span>
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
                        <LoaderCircle className="size-5 animate-spin" />
                        {record.status === "analyzing"
                          ? "Creando resumen, esquema y mapa mental…"
                          : record.status === "queued"
                            ? "En cola: el primer transcriptor libre lo recogerá."
                            : "Convirtiendo el audio en texto…"}
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
                          Puedes reintentar la transcripción automática o pegar un texto corregido para crear los materiales.
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
                          {!record.transcript && !record.audio_deleted_at ? (
                            <Button
                              disabled={activeId === record.id}
                              onClick={() => void processRecord(record, false)}
                              type="button"
                              variant="outline"
                            >
                              <Play /> Reintentar audio
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
        El audio solo existe mientras se transcribe, en un contenedor privado, y se borra después. Una grabación privada solo la ve su autor y la gestión del espacio; una compartida solo la ven miembros activos de este espacio.
      </p>
    </div>
  );
}

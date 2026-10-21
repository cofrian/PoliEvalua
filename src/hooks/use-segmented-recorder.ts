"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Graba en segmentos independientes de ~2 min sin cortar palabras:
// - a partir de MIN_SEGMENT_MS se busca una pausa (silencio ≥ SILENCE_MS);
// - si no llega, se corta a la fuerza en MAX_SEGMENT_MS;
// - el grabador nuevo arranca OVERLAP_MS antes de parar el anterior, y el
//   servidor elimina después las palabras repetidas del solape.

const MIN_SEGMENT_MS = 100_000;
const MAX_SEGMENT_MS = 150_000;
const SILENCE_MS = 400;
const OVERLAP_MS = 2_000;
const SILENCE_RMS = 0.015;
const AUDIO_BITS_PER_SECOND = 32_000;

const RECORDING_FORMATS = [
  { recorder: "audio/webm;codecs=opus", upload: "audio/webm" },
  { recorder: "audio/ogg;codecs=opus", upload: "audio/ogg" },
  { recorder: "audio/webm", upload: "audio/webm" },
  { recorder: "audio/mp4", upload: "audio/mp4" },
] as const;

export type RecordedSegment = {
  seq: number;
  blob: Blob;
  mimeType: string;
  startMs: number;
  endMs: number;
};

type ActiveSegment = {
  seq: number;
  recorder: MediaRecorder;
  chunks: Blob[];
  startMs: number;
};

type Session = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  format: (typeof RECORDING_FORMATS)[number];
  startedAt: number;
  current: ActiveSegment;
  nextSeq: number;
  silenceSince: number | null;
  closing: Promise<void>[];
  monitor: ReturnType<typeof setInterval>;
  wakeLock: WakeLockSentinel | null;
};

export function pickRecordingFormat() {
  if (typeof MediaRecorder === "undefined") return null;
  return (
    RECORDING_FORMATS.find((format) => MediaRecorder.isTypeSupported(format.recorder)) ?? null
  );
}

export function useSegmentedRecorder({
  maxSeconds,
  onSegment,
}: {
  maxSeconds: number;
  onSegment: (segment: RecordedSegment) => void;
}) {
  const sessionRef = useRef<Session | null>(null);
  const onSegmentRef = useRef(onSegment);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [segmentCount, setSegmentCount] = useState(0);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  useEffect(() => {
    onSegmentRef.current = onSegment;
  }, [onSegment]);

  const startSegment = useCallback((session: Session, seq: number): ActiveSegment => {
    const recorder = new MediaRecorder(session.stream, {
      mimeType: session.format.recorder,
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    });
    const segment: ActiveSegment = {
      seq,
      recorder,
      chunks: [],
      startMs: Date.now() - session.startedAt,
    };
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) segment.chunks.push(event.data);
    });
    recorder.start(1000);
    return segment;
  }, []);

  /** Para un segmento y entrega su archivo completo. */
  const closeSegment = useCallback((session: Session, segment: ActiveSegment) => {
    const closed = new Promise<void>((resolve) => {
      segment.recorder.addEventListener(
        "stop",
        () => {
          onSegmentRef.current({
            seq: segment.seq,
            blob: new Blob(segment.chunks, { type: session.format.upload }),
            mimeType: session.format.upload,
            startMs: segment.startMs,
            endMs: Date.now() - session.startedAt,
          });
          setSegmentCount((count) => count + 1);
          resolve();
        },
        { once: true },
      );
    });
    if (segment.recorder.state !== "inactive") segment.recorder.stop();
    return closed;
  }, []);

  const rotate = useCallback(
    (session: Session) => {
      const previous = session.current;
      session.current = startSegment(session, session.nextSeq);
      session.nextSeq += 1;
      session.silenceSince = null;
      session.closing.push(
        new Promise<void>((resolve) => {
          setTimeout(() => void closeSegment(session, previous).then(resolve), OVERLAP_MS);
        }),
      );
    },
    [closeSegment, startSegment],
  );

  const release = useCallback(async (session: Session) => {
    clearInterval(session.monitor);
    session.source.disconnect();
    session.analyser.disconnect();
    session.stream.getTracks().forEach((track) => track.stop());
    await session.context.close().catch(() => undefined);
    await session.wakeLock?.release().catch(() => undefined);
  }, []);

  const start = useCallback(async () => {
    const format = pickRecordingFormat();
    if (!navigator.mediaDevices?.getUserMedia || !format) {
      throw new Error("Este navegador no permite grabar desde el micrófono.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        // En aulas la supresión de ruido recorta la voz del ponente.
        noiseSuppression: false,
        autoGainControl: true,
      },
    });
    const context = new AudioContext();
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const analyserNode = context.createAnalyser();
    analyserNode.fftSize = 2048;
    source.connect(analyserNode);

    // En el móvil, bloquear la pantalla corta el micrófono.
    let wakeLock: WakeLockSentinel | null = null;
    try {
      wakeLock = (await navigator.wakeLock?.request("screen")) ?? null;
    } catch {
      wakeLock = null;
    }

    const samples = new Float32Array(analyserNode.fftSize);
    const session = {
      stream,
      context,
      source,
      analyser: analyserNode,
      format,
      startedAt: Date.now(),
      nextSeq: 1,
      silenceSince: null,
      closing: [],
      wakeLock,
    } as unknown as Session;
    session.current = startSegment(session, 0);
    session.monitor = setInterval(() => {
      const now = Date.now();
      const segmentAge = now - session.startedAt - session.current.startMs;
      analyserNode.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) sum += value * value;
      const silent = Math.sqrt(sum / samples.length) < SILENCE_RMS;
      session.silenceSince = silent ? (session.silenceSince ?? now) : null;

      const pauseFound =
        segmentAge >= MIN_SEGMENT_MS &&
        session.silenceSince !== null &&
        now - session.silenceSince >= SILENCE_MS;
      if (pauseFound || segmentAge >= MAX_SEGMENT_MS) rotate(session);
      setElapsedSeconds(Math.floor((now - session.startedAt) / 1000));
    }, 100);

    sessionRef.current = session;
    setAnalyser(analyserNode);
    setWakeLockActive(Boolean(wakeLock));
    setSegmentCount(0);
    setElapsedSeconds(0);
    setIsRecording(true);
  }, [rotate, startSegment]);

  /** Termina: cierra el último segmento y espera a los que estaban solapando. */
  const stop = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return null;
    sessionRef.current = null;
    setIsRecording(false);
    setAnalyser(null);
    clearInterval(session.monitor);
    await closeSegment(session, session.current);
    await Promise.all(session.closing);
    await release(session);
    setWakeLockActive(false);
    return {
      segments: session.nextSeq,
      durationSeconds: Math.max(1, Math.round((Date.now() - session.startedAt) / 1000)),
    };
  }, [closeSegment, release]);

  useEffect(() => {
    if (isRecording && elapsedSeconds >= maxSeconds) void stop();
  }, [elapsedSeconds, isRecording, maxSeconds, stop]);

  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (session) {
        session.current.recorder.stop();
        void release(session);
      }
    },
    [release],
  );

  return { start, stop, analyser, isRecording, elapsedSeconds, segmentCount, wakeLockActive };
}

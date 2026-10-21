// Copia local (IndexedDB) de los segmentos aún no confirmados por el
// servidor. Si se cae la red o se cierra la pestaña, la grabación se puede
// terminar de subir al volver. Todo falla en silencio si el navegador no
// permite IndexedDB (modo privado): la subida sigue funcionando sin copia.

export type PendingSegment = {
  key: string;
  recordingId: string;
  seq: number;
  startMs: number;
  endMs: number;
  mimeType: string;
  blob: Blob;
};

export type PendingRecording = {
  recordingId: string;
  title: string;
  stopped: boolean;
  segmentsExpected: number | null;
  durationSeconds: number;
  sizeBytes: number;
};

const DB_NAME = "upv-presentations";
const SEGMENTS = "segments";
const RECORDINGS = "recordings";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(SEGMENTS, { keyPath: "key" });
        request.result.createObjectStore(RECORDINGS, { keyPath: "recordingId" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = action(db.transaction(store, mode).objectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  }).finally(() => db.close()) as Promise<T | null>;
}

export const segmentKey = (recordingId: string, seq: number) => `${recordingId}:${seq}`;

export const saveSegment = (segment: PendingSegment) =>
  run(SEGMENTS, "readwrite", (store) => store.put(segment));

export const removeSegment = (key: string) =>
  run(SEGMENTS, "readwrite", (store) => store.delete(key));

export async function listSegments(recordingId: string) {
  const all = (await run<PendingSegment[]>(SEGMENTS, "readonly", (store) => store.getAll())) ?? [];
  return all.filter((item) => item.recordingId === recordingId).sort((a, b) => a.seq - b.seq);
}

export const saveRecording = (recording: PendingRecording) =>
  run(RECORDINGS, "readwrite", (store) => store.put(recording));

export const removeRecording = (recordingId: string) =>
  run(RECORDINGS, "readwrite", (store) => store.delete(recordingId));

export async function listRecordings() {
  return (await run<PendingRecording[]>(RECORDINGS, "readonly", (store) => store.getAll())) ?? [];
}

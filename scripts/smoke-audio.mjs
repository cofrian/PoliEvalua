// Prueba de humo del audio: sube una grabación a la app como lo haría el
// navegador y sigue la cola hasta el informe del jurado. Necesita un
// trabajador de transcripción conectado a la misma app (worker/).
// Crea un espacio y una persona temporales y los borra al terminar.
// Uso: node scripts/smoke-audio.mjs <audio.wav> [url de la app]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { loadTestEnv } from "./load-test-env.mjs";

const env = loadTestEnv();
const audioPath = process.argv[2];
const base = (process.argv[3] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
if (!audioPath) throw new Error("Falta la ruta del audio .wav");
const audio = readFileSync(audioPath);
// WAV PCM: la duración sale del tamaño y la tasa de bytes de la cabecera.
const durationSeconds = Math.max(1, Math.round((audio.length - 44) / audio.readUInt32LE(28)));

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const email = `smoke-audio-${stamp}@test.local`;
const password = `Prueba-${stamp}!`;
const started = Date.now();
const elapsed = () => `${Math.round((Date.now() - started) / 1000)} s`;
let userId = "";
let eventId = "";
let ok = false;

function step(message) {
  console.log(`[${elapsed()}] ${message}`);
}

async function api(page, path, body) {
  const response = await page.request.post(`${base}${path}`, { data: body });
  const json = await response.json().catch(() => ({}));
  if (!response.ok()) throw new Error(`${path} → HTTP ${response.status()}: ${JSON.stringify(json)}`);
  return json;
}

try {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Prueba Audio" } });
  if (error) throw error;
  userId = data.user.id;
  await db.from("profiles").update({ disabled: false, full_name: "Prueba Audio" }).eq("id", userId);
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await anon.auth.signInWithPassword({ email, password });
  const { data: created, error: createError } = await anon.rpc("create_event_space", {
    p_name: `Prueba de audio ${stamp}`, p_slug: `smoke-audio-${stamp}`, p_kind: "class", p_signup_code: `AUDIO-${stamp}`,
    p_description: "Prueba automática del audio; se borra sola",
    p_settings: { participant_mode: "groups", evaluation_mode: "mixed", enabled_roles: ["teacher", "student", "judge"], join_roles: ["student"], modules: ["participants", "rubric", "notes", "results"] },
  });
  if (createError) throw createError;
  eventId = created;
  const { data: event } = await db.from("events").select("settings").eq("id", eventId).single();
  await db.from("events").update({ settings: { ...event.settings, recording: { enabled: true, notice_version: 1 } } }).eq("id", eventId);
  await db.from("event_members").update({ recording_notice_version: 1, recording_notice_ack_at: new Date().toISOString() }).eq("event_id", eventId).eq("user_id", userId);
  const { data: team } = await db.from("teams").insert({ event_id: eventId, name: "Grupo Aurora", number: 1, project_title: "Riego inteligente para huertos urbanos" }).select("id").single();
  // Rúbrica mínima para que el informe pueda citar evidencias por criterio.
  const { data: rubric } = await db.from("rubrics").select("id").eq("event_id", eventId).eq("is_active", true).single();
  const { data: criteria } = await db.from("rubric_criteria").insert([
    { event_id: eventId, rubric_id: rubric.id, title: "Impacto y problema", description: "Claridad del problema y del beneficio", weight: 50, order: 1 },
    { event_id: eventId, rubric_id: rubric.id, title: "Viabilidad", description: "Pruebas, costes y siguientes pasos", weight: 50, order: 2 },
  ]).select("id");
  await db.from("rubric_levels").insert(criteria.flatMap((criterion) =>
    [[1, "Insuficiente"], [3, "Adecuado"], [5, "Excelente"]].map(([score, label]) => ({ event_id: eventId, criterion_id: criterion.id, score, label })),
  ));
  step(`Espacio temporal listo (${durationSeconds} s de audio, ${base})`);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar en la plataforma" }).click();
  await page.waitForURL("**/espacios");
  await context.addCookies([{ name: "active_event_id", value: eventId, url: base }]);

  const { id } = await api(page, "/api/presentations", { teamId: team.id, title: "Exposición de prueba", visibility: "event" });
  const segment = await api(page, `/api/presentations/${id}/segments`, {
    seq: 0, startMs: 0, endMs: durationSeconds * 1000, sizeBytes: audio.length, mimeType: "audio/wav",
  });
  const { error: uploadError } = await anon.storage
    .from("presentation-audio")
    .uploadToSignedUrl(segment.path, segment.token, audio, { contentType: "audio/wav" });
  if (uploadError) throw uploadError;
  await api(page, `/api/presentations/${id}/segments/0/uploaded`, {});
  await api(page, `/api/presentations/${id}/finalize`, { segmentsExpected: 1, durationSeconds, sizeBytes: audio.length });
  await browser.close();
  step("Audio subido y grabación cerrada: en cola");

  let last = "";
  let lastJobs = "";
  let recording;
  const deadline = Date.now() + Number(process.env.SMOKE_TIMEOUT_MINUTES || 15) * 60_000;
  while (Date.now() < deadline) {
    ({ data: recording } = await db
      .from("presentation_recordings")
      .select("status, transcript, summary, error_message, audio_deleted_at")
      .eq("id", id)
      .single());
    if (recording.status !== last) {
      step(`Estado: ${recording.status}`);
      last = recording.status;
    }
    const { data: jobs } = await db.from("processing_jobs").select("kind, runner, status, attempts, last_error").eq("recording_id", id).order("created_at");
    const summary = (jobs ?? []).map((job) => `${job.kind}/${job.runner} ${job.status} #${job.attempts}${job.last_error ? ` — ${job.last_error.slice(0, 160)}` : ""}`).join("\n    ");
    if (summary !== lastJobs) {
      step(`Cola:\n    ${summary}`);
      lastJobs = summary;
    }
    if (["ready", "failed"].includes(recording.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  const [{ data: report }, { data: files }] = await Promise.all([
    db.from("presentation_jury_reports").select("criteria_evidence, questions, risks").eq("recording_id", id).maybeSingle(),
    db.storage.from("presentation-audio").list(`events/${eventId}/presentations/${team.id}/${id}`),
  ]);
  console.log("\n— Transcripción —\n" + (recording.transcript ?? "(ninguna)").slice(0, 600));
  console.log("\n— Resumen —\n" + (recording.summary ?? "(ninguno)").slice(0, 600));
  console.log(`\n— Informe del jurado — ${report ? `${(report.criteria_evidence ?? []).length} criterios con evidencias, ${(report.questions ?? []).length} preguntas, ${(report.risks ?? []).length} riesgos` : "(ninguno)"}`);
  console.log(`— Audio en el almacenamiento: ${files?.length ?? 0} archivos · borrado registrado: ${recording.audio_deleted_at ? "sí" : "no"}`);
  if (recording.error_message) console.log(`— Error: ${recording.error_message}`);
  ok = recording.status === "ready" && Boolean(recording.transcript) && !files?.length;
  step(ok ? "PRUEBA SUPERADA" : "PRUEBA FALLIDA");
} finally {
  if (eventId) await db.from("events").delete().eq("id", eventId);
  if (userId) {
    await db.from("audit_log").delete().eq("user_id", userId);
    await db.auth.admin.deleteUser(userId);
  }
  process.exitCode = ok ? 0 : 1;
}

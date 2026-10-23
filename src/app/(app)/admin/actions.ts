"use server";

import { createHash, randomBytes } from "node:crypto";
import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import {
  cleanAdminText,
  INSTRUCTIONS_MAX,
} from "@/lib/ai/prompts/presentation";
import { logAudit } from "@/lib/app/audit";
import { assignPeerReviews, peerReviewSettings } from "@/lib/app/peer-review";
import { getSession } from "@/lib/app/session";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const session = await getSession();
  if (!session.isAdmin) throw new Error("Solo el admin puede hacer esto.");
  return session;
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optional(formData: FormData, key: string) {
  return text(formData, key) || null;
}

function refreshAll() {
  revalidatePath("/", "layout");
}

const roleSchema = z.enum(["manager", "judge", "mentor", "teacher", "student", "reviewer", "viewer"]);
const statusSchema = z.enum(["setup", "building", "judging", "closed"]);

export type InvitationState = { error?: string; link?: string };

export async function createInvitationAction(
  _previousState: InvitationState,
  formData: FormData,
): Promise<InvitationState> {
  const { supabase, user, event } = await requireAdmin();
  const parsed = z
    .object({
      email: z.string().trim().toLowerCase().email(),
      role: roleSchema,
      days: z.coerce.number().int().min(1).max(30),
    })
    .safeParse({
      email: formData.get("email"),
      role: formData.get("role"),
      days: formData.get("days"),
    });
  if (!parsed.success) return { error: "Revisa el correo, el rol y la caducidad." };

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(
    Date.now() + parsed.data.days * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { error } = await supabase.from("event_invitations").insert({
    event_id: event.id,
    email: parsed.data.email,
    role: parsed.data.role,
    token_hash: tokenHash,
    expires_at: expiresAt,
    created_by: user.id,
  });
  if (error) return { error: "No se ha podido crear la invitación." };

  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host");
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol = forwardedProtocol ?? (host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https");
  const siteUrl = host
    ? `${protocol}://${host}`
    : (process.env.NEXT_PUBLIC_SITE_URL ?? "https://valencia-hack-jurado.vercel.app").replace(/\/$/, "");
  await logAudit(supabase, event.id, user.id, "crear_invitacion", "event_invitations", null, {
    email: parsed.data.email,
    role: parsed.data.role,
  });
  return { link: `${siteUrl}/login?invite=${token}` };
}

export async function revokeInvitationAction(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const id = text(formData, "id");
  await supabase
    .from("event_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("event_id", event.id);
  await logAudit(supabase, event.id, user.id, "revocar_invitacion", "event_invitations", id);
  refreshAll();
}

// ========== USUARIOS ==========

export async function setUserRoleAction(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const id = text(formData, "id");
  const role = roleSchema.parse(formData.get("role"));
  if (id === user.id) return; // evita que el admin se quite su propio rol

  await supabase
    .from("event_members")
    .update({ role })
    .eq("event_id", event.id)
    .eq("user_id", id);
  await logAudit(supabase, event.id, user.id, "cambiar_rol", "event_members", id, { role });
  refreshAll();
}

export async function toggleUserDisabledAction(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const id = text(formData, "id");
  const disabled = formData.get("disabled") === "true";
  if (id === user.id) return;

  await supabase
    .from("event_members")
    .update({ status: disabled ? "inactive" : "active" })
    .eq("event_id", event.id)
    .eq("user_id", id);
  await logAudit(supabase, event.id, user.id, disabled ? "desactivar_miembro" : "reactivar_miembro", "event_members", id);
  refreshAll();
}

// ========== EVENTO ==========

export async function updateEventAction(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const id = text(formData, "id");
  const status = statusSchema.parse(formData.get("status"));
  const signupCode = text(formData, "signupCode").toUpperCase();
  const changes = {
    name: text(formData, "name") || undefined,
    status,
    signup_open: formData.get("signupOpen") === "on",
    ...(signupCode ? { signup_code: signupCode } : {}),
  };

  if (id !== event.id) throw new Error("El espacio activo no coincide.");
  await supabase.from("events").update(changes).eq("id", event.id);
  await logAudit(supabase, event.id, user.id, "actualizar_evento", "events", id, changes);
  refreshAll();
}

// ========== GRABACIÓN ==========

export async function updateRecordingSettingsAction(formData: FormData) {
  const { supabase, user, event, recording } = await requireAdmin();
  const enabled = formData.get("enabled") === "on";
  const customText = text(formData, "noticeText").slice(0, 2000) || null;

  // Activar o cambiar el texto obliga a que todos vuelvan a confirmar el aviso.
  const mustReconfirm =
    enabled && (!recording.enabled || customText !== recording.customText);
  const next = {
    enabled,
    notice_version: mustReconfirm ? recording.noticeVersion + 1 : recording.noticeVersion,
    notice_text: customText,
  };

  const { data: current } = await supabase
    .from("events")
    .select("settings")
    .eq("id", event.id)
    .single();
  const settings = { ...((current?.settings as Record<string, unknown> | null) ?? {}), recording: next };
  const { error } = await supabase.from("events").update({ settings }).eq("id", event.id);
  if (error) throw new Error("No se ha podido guardar la configuración de grabación.");

  await logAudit(supabase, event.id, user.id, "configurar_grabacion", "events", event.id, next);
  refreshAll();
}

// ========== ALUMNADO ==========

export async function updateStudentVisibilityAction(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const showRubric = formData.get("showRubric") === "on";
  const publishResults = formData.get("publishResults") === "on";
  const { data: current } = await supabase
    .from("events")
    .select("settings")
    .eq("id", event.id)
    .single();
  const settings = {
    ...((current?.settings as Record<string, unknown> | null) ?? {}),
    students: { show_rubric: showRubric, publish_results: publishResults },
  };
  const { error } = await supabase.from("events").update({ settings }).eq("id", event.id);
  if (error) throw new Error("No se ha podido guardar la visibilidad para el alumnado.");
  await logAudit(supabase, event.id, user.id, "visibilidad_alumnado", "events", event.id, {
    show_rubric: showRubric,
    publish_results: publishResults,
  });
  refreshAll();
}

// ========== ENTREGAS ==========

export async function updateMaterialsSettingsAction(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const driveUrl = text(formData, "driveUrl");
  if (driveUrl && !/^https?:\/\//i.test(driveUrl)) {
    throw new Error("El enlace de la carpeta debe empezar por https://");
  }
  const materials = {
    drive_url: driveUrl.slice(0, 2000) || null,
    instructions: text(formData, "instructions").slice(0, 2000) || null,
  };
  const { data: current } = await supabase
    .from("events")
    .select("settings")
    .eq("id", event.id)
    .single();
  const settings = { ...((current?.settings as Record<string, unknown> | null) ?? {}), materials };
  const { error } = await supabase.from("events").update({ settings }).eq("id", event.id);
  if (error) throw new Error("No se ha podido guardar la configuración de entregas.");
  await logAudit(supabase, event.id, user.id, "configurar_entregas", "events", event.id, materials);
  refreshAll();
}

// ========== INTELIGENCIA ARTIFICIAL ==========

export async function updateAiSettingsAction(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const rawInstructions = text(formData, "aiInstructions");
  if (rawInstructions.length > INSTRUCTIONS_MAX) {
    throw new Error(`Las indicaciones no pueden pasar de ${INSTRUCTIONS_MAX} caracteres.`);
  }
  const ai = {
    instructions: cleanAdminText(rawInstructions, INSTRUCTIONS_MAX) || null,
  };
  const { data: current } = await supabase
    .from("events")
    .select("settings")
    .eq("id", event.id)
    .single();
  const settings = { ...((current?.settings as Record<string, unknown> | null) ?? {}), ai };
  const { error } = await supabase.from("events").update({ settings }).eq("id", event.id);
  if (error) throw new Error("No se han podido guardar los ajustes de IA.");
  await logAudit(supabase, event.id, user.id, "configurar_ia", "events", event.id, ai);
  refreshAll();
}

// ========== AGENDA ==========

/** Convierte «2026-11-05T09:30» (hora de Valencia) a un instante UTC. */
function madridLocalToUtc(value: string) {
  const asUtc = new Date(`${value}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  const madrid = new Date(asUtc.toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
  const utc = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(asUtc.getTime() - (madrid.getTime() - utc.getTime()));
}

export type AgendaState = { ok: boolean; message: string } | null;

/**
 * Genera la agenda completa: reparte los grupos entre las salas (por número o
 * al azar) y calcula la hora de cada turno. Sustituye la agenda anterior.
 */
export async function generateAgendaAction(
  _previous: AgendaState,
  formData: FormData,
): Promise<AgendaState> {
  const { supabase, user, event, words } = await requireAdmin();
  const parsed = z
    .object({
      rooms: z.string().trim().min(1).max(400),
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
      duration: z.coerce.number().int().min(1).max(240),
      gap: z.coerce.number().int().min(0).max(120),
      order: z.enum(["number", "random"]),
    })
    .safeParse({
      rooms: formData.get("rooms"),
      start: formData.get("start"),
      duration: formData.get("duration"),
      gap: formData.get("gap"),
      order: formData.get("order"),
    });
  if (!parsed.success) return { ok: false, message: "Revisa las salas, la hora de inicio y la duración." };

  const start = madridLocalToUtc(parsed.data.start);
  if (!start) return { ok: false, message: "La hora de inicio no es válida." };
  const rooms = [...new Set(parsed.data.rooms.split(",").map((room) => room.trim()).filter(Boolean))].slice(0, 20);

  const { data: teams } = await supabase
    .from("teams")
    .select("id, number")
    .eq("event_id", event.id)
    .order("number");
  if (!teams?.length) return { ok: false, message: `Primero crea los ${words.unitsLower}.` };

  const ordered =
    parsed.data.order === "random"
      ? [...teams].sort(() => Math.random() - 0.5)
      : teams;
  const step = (parsed.data.duration + parsed.data.gap) * 60_000;
  const rows = ordered.map((team, index) => {
    const position = Math.floor(index / rooms.length);
    return {
      event_id: event.id,
      team_id: team.id,
      room: rooms[index % rooms.length],
      position,
      starts_at: new Date(start.getTime() + position * step).toISOString(),
      duration_minutes: parsed.data.duration,
    };
  });

  const { error: deleteError } = await supabase.from("presentation_slots").delete().eq("event_id", event.id);
  if (deleteError) return { ok: false, message: "No se ha podido sustituir la agenda anterior." };
  const { error } = await supabase.from("presentation_slots").insert(rows);
  if (error) return { ok: false, message: "No se ha podido guardar la agenda." };

  await logAudit(supabase, event.id, user.id, "generar_agenda", "presentation_slots", null, {
    rooms,
    slots: rows.length,
  });
  refreshAll();
  return { ok: true, message: `Agenda creada: ${rows.length} turnos en ${rooms.length} sala(s).` };
}

/** Mueve un turno una posición arriba o abajo dentro de su sala y recalcula horas. */
export async function moveSlotAction(formData: FormData) {
  const { supabase, event } = await requireAdmin();
  const id = text(formData, "id");
  const direction = text(formData, "direction") === "up" ? -1 : 1;

  const { data: slot } = await supabase
    .from("presentation_slots")
    .select("room")
    .eq("id", id)
    .eq("event_id", event.id)
    .single();
  if (!slot) return;
  const { data: roomSlots } = await supabase
    .from("presentation_slots")
    .select("id, position, starts_at, duration_minutes")
    .eq("event_id", event.id)
    .eq("room", slot.room)
    .order("position");
  const list = roomSlots ?? [];
  const index = list.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length) return;

  // Se intercambian las posiciones y las horas planificadas: cada hora sigue en su hueco.
  const a = list[index];
  const b = list[target];
  await Promise.all([
    supabase.from("presentation_slots").update({ position: b.position, starts_at: b.starts_at }).eq("id", a.id),
    supabase.from("presentation_slots").update({ position: a.position, starts_at: a.starts_at }).eq("id", b.id),
  ]);
  refreshAll();
}

export async function clearAgendaAction() {
  const { supabase, user, event } = await requireAdmin();
  await supabase.from("presentation_slots").delete().eq("event_id", event.id);
  await logAudit(supabase, event.id, user.id, "borrar_agenda", "presentation_slots", null);
  refreshAll();
}

// ========== COEVALUACIÓN ==========

export async function updatePeerReviewSettingsAction(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const number = (key: string, min: number, max: number, fallback: number) => {
    const value = Number(text(formData, key));
    return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
  };
  const peerReview = {
    enabled: formData.get("enabled") === "on",
    peer: formData.get("peer") === "on",
    self: formData.get("self") === "on",
    contribution: formData.get("contribution") === "on",
    reviews_per_student: number("reviewsPerStudent", 1, 10, 2),
    anonymous: formData.get("anonymous") === "on",
    weights: {
      teacher: number("weightTeacher", 0, 100, 80),
      peer: number("weightPeer", 0, 100, 20),
      self: number("weightSelf", 0, 100, 0),
    },
  };
  const { data: current } = await supabase.from("events").select("settings").eq("id", event.id).single();
  const settings = { ...((current?.settings as Record<string, unknown> | null) ?? {}), peer_review: peerReview };
  const { error } = await supabase.from("events").update({ settings }).eq("id", event.id);
  if (error) throw new Error("No se ha podido guardar la coevaluación.");
  await logAudit(supabase, event.id, user.id, "configurar_coevaluacion", "events", event.id, peerReview);
  refreshAll();
}

export type PeerAssignState = { ok: boolean; message: string } | null;

/** Reparte de nuevo los grupos a evaluar. Las revisiones ya hechas se conservan. */
export async function generatePeerAssignmentsAction(): Promise<PeerAssignState> {
  const { supabase, user, event, words } = await requireAdmin();
  const settings = peerReviewSettings(event.settings);
  const [{ data: members }, { data: teams }] = await Promise.all([
    supabase.from("team_members").select("user_id, team_id").eq("event_id", event.id).not("user_id", "is", null),
    supabase.from("teams").select("id").eq("event_id", event.id),
  ]);
  const students = (members ?? []).map((member) => ({ userId: member.user_id as string, teamId: member.team_id }));
  if (!students.length) {
    return { ok: false, message: "Ningún estudiante ha entrado todavía con su correo: no hay a quién asignar." };
  }
  if ((teams ?? []).length < 2) return { ok: false, message: `Hacen falta al menos dos ${words.unitsLower}.` };

  const assignments = assignPeerReviews(
    students,
    (teams ?? []).map((team) => team.id),
    Math.min(settings.reviewsPerStudent, (teams ?? []).length - 1),
  );
  const { error: deleteError } = await supabase.from("peer_assignments").delete().eq("event_id", event.id);
  if (deleteError) return { ok: false, message: "No se ha podido sustituir el reparto anterior." };
  const { error } = await supabase.from("peer_assignments").insert(
    assignments.map((item) => ({ event_id: event.id, reviewer_id: item.reviewerId, team_id: item.teamId })),
  );
  if (error) return { ok: false, message: "No se ha podido guardar el reparto." };

  await logAudit(supabase, event.id, user.id, "repartir_coevaluacion", "peer_assignments", null, {
    students: students.length,
    assignments: assignments.length,
  });
  refreshAll();
  return {
    ok: true,
    message: `Reparto hecho: ${students.length} estudiantes, ${assignments.length} revisiones asignadas.`,
  };
}

// ========== PÚBLICO ==========

export async function updatePublicVoteAction(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const publicVote = {
    open: formData.get("open") === "on",
    show_results: formData.get("showResults") === "on",
    title: text(formData, "title").slice(0, 120) || null,
  };
  const { data: current } = await supabase.from("events").select("settings").eq("id", event.id).single();
  const settings = { ...((current?.settings as Record<string, unknown> | null) ?? {}), public_vote: publicVote };
  const { error } = await supabase.from("events").update({ settings }).eq("id", event.id);
  if (error) throw new Error("No se ha podido guardar la votación del público.");
  await logAudit(supabase, event.id, user.id, "configurar_voto_publico", "events", event.id, publicVote);
  refreshAll();
}

export async function resetPublicVotesAction() {
  const { user, event, supabase } = await requireAdmin();
  // Los votos no tienen política de borrado para nadie: se borran con la clave de servicio.
  await createAdminClient().from("public_votes").delete().eq("event_id", event.id);
  await logAudit(supabase, event.id, user.id, "reiniciar_voto_publico", "public_votes", null);
  refreshAll();
}

// ========== RETOS ==========

export async function saveChallengeAction(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const id = text(formData, "id");
  const values = {
    name: text(formData, "name"),
    description: optional(formData, "description"),
    order: Number(text(formData, "order")) || 0,
  };
  if (!values.name) return;

  if (id) {
    await supabase.from("challenges").update(values).eq("id", id).eq("event_id", event.id);
    await logAudit(supabase, event.id, user.id, "editar_reto", "challenges", id, values);
  } else {
    const { data } = await supabase
      .from("challenges")
      .insert({ ...values, event_id: event.id })
      .select("id")
      .single();
    await logAudit(supabase, event.id, user.id, "crear_reto", "challenges", data?.id ?? null, values);
  }
  refreshAll();
}

export async function deleteChallengeAction(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const id = text(formData, "id");
  const { count } = await supabase
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id)
    .eq("challenge_id", id);
  if (count) throw new Error("Mueve o borra antes los equipos de este reto.");

  await supabase.from("challenges").delete().eq("id", id).eq("event_id", event.id);
  await logAudit(supabase, event.id, user.id, "borrar_reto", "challenges", id);
  refreshAll();
}

// ========== EQUIPOS Y PARTICIPANTES ==========

export async function saveTeamAction(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const id = text(formData, "id");
  const values = {
    name: text(formData, "name"),
    number: Number(text(formData, "number")) || null,
    challenge_id: text(formData, "challengeId"),
    project_title: optional(formData, "projectTitle"),
    description: optional(formData, "description"),
    table_location: optional(formData, "tableLocation"),
  };
  if (!values.name || !values.challenge_id) return;

  if (id) {
    await supabase.from("teams").update(values).eq("id", id).eq("event_id", event.id);
    await logAudit(supabase, event.id, user.id, "editar_equipo", "teams", id, values);
  } else {
    const { data } = await supabase.from("teams").insert({ ...values, event_id: event.id }).select("id").single();
    await logAudit(supabase, event.id, user.id, "crear_equipo", "teams", data?.id ?? null, values);
  }
  refreshAll();
}

export async function deleteTeamAction(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const id = text(formData, "id");
  const { count } = await supabase
    .from("evaluations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id)
    .eq("team_id", id);
  if (count) {
    throw new Error("Este equipo ya tiene evaluaciones; no se puede borrar.");
  }

  await supabase.from("teams").delete().eq("id", id).eq("event_id", event.id);
  await logAudit(supabase, event.id, user.id, "borrar_equipo", "teams", id);
  refreshAll();
}

export async function addMemberAction(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const teamId = text(formData, "teamId");
  const fullName = text(formData, "fullName");
  const email = text(formData, "email").toLowerCase() || null;
  if (!fullName) return;
  if (email && !z.string().email().safeParse(email).success) {
    throw new Error("El correo no es válido.");
  }

  const { error } = await supabase
    .from("team_members")
    .insert({ event_id: event.id, team_id: teamId, full_name: fullName, email });
  if (error?.code === "23505") throw new Error("Ese correo ya está en otro grupo de este espacio.");
  await logAudit(supabase, event.id, user.id, "añadir_participante", "teams", teamId, { fullName });
  refreshAll();
}

export async function renameMemberAction(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const id = text(formData, "id");
  const fullName = text(formData, "fullName");
  const email = text(formData, "email").toLowerCase() || null;
  if (!fullName) return;
  if (email && !z.string().email().safeParse(email).success) {
    throw new Error("El correo no es válido.");
  }

  const { error } = await supabase
    .from("team_members")
    .update({ full_name: fullName, email })
    .eq("id", id)
    .eq("event_id", event.id);
  if (error?.code === "23505") throw new Error("Ese correo ya está en otro grupo de este espacio.");
  await logAudit(supabase, event.id, user.id, "renombrar_participante", "team_members", id, { fullName });
  refreshAll();
}

export async function removeMemberAction(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const id = text(formData, "id");

  await supabase.from("team_members").delete().eq("id", id).eq("event_id", event.id);
  await logAudit(supabase, event.id, user.id, "retirar_participante", "team_members", id);
  refreshAll();
}

export type ImportState = { message: string; ok: boolean } | null;

// Importa el mismo formato que equipos.txt (tabuladores) o CSV:
// Reto, Nº, Equipo, Miembro 1…Miembro N. Crea o actualiza por nombre de equipo
// y añade los integrantes que falten; no borra nada.
export async function importTeamsAction(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const { supabase, user, event } = await requireAdmin();
  const file = formData.get("file");
  const raw =
    file instanceof File && file.size ? await file.text() : text(formData, "content");
  if (!raw) return { ok: false, message: "Pega el contenido o sube un archivo." };

  const parsed = Papa.parse<string[]>(raw.replace(/^﻿/, "").trim(), {
    delimiter: raw.includes("\t") ? "\t" : "",
    skipEmptyLines: true,
  });
  const rows = parsed.data.filter((row) => row.length >= 3);
  if (rows[0] && !/^\d+$/.test(rows[0][1]?.trim() ?? "")) rows.shift(); // cabecera

  const { data: challenges } = await supabase.from("challenges").select("id, name").eq("event_id", event.id);
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, team_members(full_name)")
    .eq("event_id", event.id);
  const challengeIds = new Map((challenges ?? []).map((c) => [c.name.toLowerCase(), c.id]));

  let created = 0;
  let updated = 0;
  let members = 0;

  for (const row of rows) {
    const [challengeName, number, name, ...rest] = row.map((cell) => cell.trim());
    if (!name) continue;
    // La última columna de equipos.txt es el nº de miembros; se ignora si es un número.
    const memberNames = rest.filter((cell) => cell && !/^\d+$/.test(cell));

    let challengeId = challengeIds.get(challengeName.toLowerCase());
    if (!challengeId) {
      const { data } = await supabase
        .from("challenges")
        .insert({ event_id: event.id, name: challengeName, order: challengeIds.size + 1 })
        .select("id")
        .single();
      if (!data) continue;
      challengeId = data.id;
      challengeIds.set(challengeName.toLowerCase(), data.id);
    }

    const existing = (teams ?? []).find((t) => t.name === name);
    let teamId = existing?.id;
    if (teamId) {
      await supabase
        .from("teams")
        .update({ number: Number(number) || null, challenge_id: challengeId })
        .eq("id", teamId)
        .eq("event_id", event.id);
      updated++;
    } else {
      const { data } = await supabase
        .from("teams")
        .insert({ event_id: event.id, name, number: Number(number) || null, challenge_id: challengeId })
        .select("id")
        .single();
      if (!data) continue;
      teamId = data.id;
      created++;
    }

    const have = new Set(
      ((existing?.team_members ?? []) as { full_name: string }[]).map((m) => m.full_name),
    );
    const missing = memberNames.filter((m) => !have.has(m));
    if (missing.length) {
      await supabase
        .from("team_members")
        .insert(missing.map((full_name) => ({ event_id: event.id, team_id: teamId, full_name })));
      members += missing.length;
    }
  }

  await logAudit(supabase, event.id, user.id, "importar_equipos", "teams", null, {
    created,
    updated,
    members,
  });
  refreshAll();
  return {
    ok: true,
    message: `Importación hecha: ${created} equipos nuevos, ${updated} actualizados y ${members} participantes añadidos.`,
  };
}

export type RosterImportState = { ok: boolean; message: string } | null;

const rosterSchema = z
  .array(
    z.object({
      fullName: z.string().trim().min(1).max(160),
      email: z.string().trim().toLowerCase().email(),
      group: z.string().trim().max(100).nullable(),
    }),
  )
  .min(1)
  .max(1000);

/**
 * Da de alta al alumnado ya revisado en la vista previa. Crea los grupos que
 * falten (por nombre) y añade a cada persona con su correo; quien ya estaba en
 * el espacio con ese correo se salta. Al entrar con ese correo, cada estudiante
 * queda vinculado a su grupo automáticamente.
 */
export async function importRosterAction(
  _previous: RosterImportState,
  formData: FormData,
): Promise<RosterImportState> {
  const { supabase, user, event, words } = await requireAdmin();
  let parsed: z.infer<typeof rosterSchema>;
  try {
    parsed = rosterSchema.parse(JSON.parse(text(formData, "roster")));
  } catch {
    return { ok: false, message: "La lista no es válida. Revisa la vista previa e inténtalo de nuevo." };
  }

  const [{ data: teams }, { data: existingMembers }] = await Promise.all([
    supabase.from("teams").select("id, name, number").eq("event_id", event.id),
    supabase.from("team_members").select("email").eq("event_id", event.id).not("email", "is", null),
  ]);
  const teamIds = new Map((teams ?? []).map((team) => [team.name.toLowerCase(), team.id]));
  let nextNumber = Math.max(0, ...(teams ?? []).map((team) => team.number ?? 0)) + 1;
  const known = new Set((existingMembers ?? []).map((member) => member.email?.toLowerCase()));

  const pending = parsed.filter((student) => !known.has(student.email));
  const skipped = parsed.length - pending.length;
  const withoutGroup = pending.filter((student) => !student.group).length;
  let createdGroups = 0;

  for (const name of new Set(pending.flatMap((student) => (student.group ? [student.group] : [])))) {
    if (teamIds.has(name.toLowerCase())) continue;
    const { data, error } = await supabase
      .from("teams")
      .insert({ event_id: event.id, name, number: nextNumber })
      .select("id")
      .single();
    if (error || !data) return { ok: false, message: `No se ha podido crear «${name}».` };
    teamIds.set(name.toLowerCase(), data.id);
    nextNumber += 1;
    createdGroups += 1;
  }

  const rows = pending
    .filter((student) => student.group)
    .map((student) => ({
      event_id: event.id,
      team_id: teamIds.get(student.group!.toLowerCase())!,
      full_name: student.fullName,
      email: student.email,
    }));
  if (rows.length) {
    const { error } = await supabase.from("team_members").insert(rows);
    if (error) return { ok: false, message: "No se ha podido guardar el alumnado. No se ha añadido nadie." };
  }

  await logAudit(supabase, event.id, user.id, "importar_alumnado", "team_members", null, {
    added: rows.length,
    skipped,
    createdGroups,
  });
  refreshAll();
  const parts = [
    `${rows.length} estudiantes añadidos`,
    `${createdGroups} ${words.unitsLower} nuevos`,
    skipped ? `${skipped} ya estaban` : null,
    withoutGroup ? `${withoutGroup} sin ${words.unitLower} (no se han añadido)` : null,
  ].filter(Boolean);
  return { ok: true, message: `${parts.join(" · ")}.` };
}

// ========== PATROCINADORES ==========

async function uploadLogo(file: FormDataEntryValue | null, name: string) {
  if (!(file instanceof File) || !file.size) return null;
  const { supabase, event } = await requireAdmin();
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `events/${event.id}/sponsors/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from("public-assets")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw new Error("No se ha podido subir el logo.");
  return supabase.storage.from("public-assets").getPublicUrl(path).data.publicUrl;
}

export async function saveSponsorAction(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!name) return;

  const light = await uploadLogo(formData.get("logoLight"), `${name}-claro`);
  const dark = await uploadLogo(formData.get("logoDark"), `${name}-oscuro`);
  const values = {
    event_id: event.id,
    name,
    url: optional(formData, "url"),
    order: Number(text(formData, "order")) || 0,
    display_height: Math.min(Math.max(Number(text(formData, "displayHeight")) || 40, 16), 96),
    aspect_ratio: Number(text(formData, "aspectRatio").replace(",", ".")) || 3,
    dark_background: formData.get("darkBackground") === "on",
    ...(light ? { logo_light_url: light } : {}),
    ...(dark ? { logo_dark_url: dark } : light && !id ? { logo_dark_url: light } : {}),
  };

  if (id) {
    await supabase.from("sponsors").update(values).eq("id", id).eq("event_id", event.id);
    await logAudit(supabase, event.id, user.id, "editar_patrocinador", "sponsors", id, { name });
  } else {
    const { data } = await supabase.from("sponsors").insert(values).select("id").single();
    await logAudit(supabase, event.id, user.id, "crear_patrocinador", "sponsors", data?.id ?? null, { name });
  }
  refreshAll();
}

export async function deleteSponsorAction(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const id = text(formData, "id");
  await supabase.from("sponsors").delete().eq("id", id).eq("event_id", event.id);
  await logAudit(supabase, event.id, user.id, "borrar_patrocinador", "sponsors", id);
  refreshAll();
}

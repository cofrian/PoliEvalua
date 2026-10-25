"use server";

import { adminMessage } from "@/lib/app/admin-messages";
import { buildAgenda } from "@/lib/app/agenda-builder";
import { isLocale } from "@/i18n/config";
import { isSpokenLanguage, retentionMonths } from "@/lib/app/recording-notice";
import { createHash, randomBytes } from "node:crypto";
import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { cookies, headers } from "next/headers";
import { z } from "zod";

import {
  cleanAdminText,
  INSTRUCTIONS_MAX,
} from "@/lib/ai/prompts/presentation";
import { logAudit } from "@/lib/app/audit";
import { TURN_REMINDER_OPTIONS, sendInvitationEmail, sendResultsPublished } from "@/lib/app/email-notifications";
import { assignPeerReviews, peerReviewSettings } from "@/lib/app/peer-review";
import { asJoinableRole, setJoinCodes } from "@/lib/app/join-codes";
import { getSession } from "@/lib/app/session";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const session = await getSession();
  if (!session.isAdmin) throw new Error(await adminMessage("onlyAdmin"));
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

export type InvitationState = { error?: string; link?: string; emailed?: boolean };

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
  if (!parsed.success) return { error: await adminMessage("inviteInvalid") };

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
  if (error) return { error: await adminMessage("inviteFailed") };

  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host");
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol = forwardedProtocol ?? (host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https");
  const siteUrl = host
    ? `${protocol}://${host}`
    : (process.env.NEXT_PUBLIC_SITE_URL ?? "https://polievalua.tech").replace(/\/$/, "");
  await logAudit(supabase, event.id, user.id, "crear_invitacion", "event_invitations", null, {
    email: parsed.data.email,
    role: parsed.data.role,
  });
  const link = `${siteUrl}/login?invite=${token}`;
  const emailed =
    (await sendInvitationEmail({
      email: parsed.data.email,
      eventName: event.name,
      role: parsed.data.role,
      link,
      locale: event.locale,
    })) > 0;
  return { link, emailed };
}

async function revokeInvitationActionRun(formData: FormData) {
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

async function setUserRoleActionRun(formData: FormData) {
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

async function toggleUserDisabledActionRun(formData: FormData) {
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

async function updateEventActionRun(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const id = text(formData, "id");
  const status = statusSchema.parse(formData.get("status"));
  const signupCode = text(formData, "signupCode").toUpperCase();
  const locale = formData.get("locale");
  const changes = {
    name: text(formData, "name") || undefined,
    status,
    signup_open: formData.get("signupOpen") === "on",
    ...(signupCode ? { signup_code: signupCode } : {}),
    ...(isLocale(locale) ? { locale } : {}),
  };

  if (id !== event.id) throw new Error(await adminMessage("spaceMismatch"));
  if (signupCode && (signupCode.length < 6 || signupCode.length > 40)) {
    throw new Error(await adminMessage("codeLength"));
  }
  // Quién participa (equipos, grupos, personas…) se puede cambiar después de crear el espacio.
  const mode = text(formData, "participantMode");
  if (["teams", "groups", "individuals", "candidates"].includes(mode)) {
    const { data: current } = await supabase.from("events").select("settings").eq("id", event.id).single();
    Object.assign(changes, {
      settings: { ...((current?.settings as Record<string, unknown> | null) ?? {}), participant_mode: mode },
    });
  }
  const { error: updateError } = await supabase.from("events").update(changes).eq("id", event.id);
  if (updateError) {
    throw new Error(await adminMessage(updateError.code === "23505" ? "codeInUse" : "saveFailed"));
  }
  await logAudit(supabase, event.id, user.id, "actualizar_evento", "events", id, changes);
  refreshAll();
}

// ========== GRABACIÓN ==========

async function updateRecordingSettingsActionRun(formData: FormData) {
  const { supabase, user, event, recording } = await requireAdmin();
  const enabled = formData.get("enabled") === "on";
  const customText = text(formData, "noticeText").slice(0, 2000) || null;

  const months = retentionMonths(text(formData, "retentionMonths"));

  // Activar, cambiar el texto o el plazo obliga a que todos vuelvan a confirmar el aviso.
  const mustReconfirm =
    enabled &&
    (!recording.enabled || customText !== recording.customText || months !== recording.retentionMonths);
  const spokenLanguage = formData.get("spokenLanguage");
  const next = {
    enabled,
    spoken_language: isSpokenLanguage(spokenLanguage) ? spokenLanguage : "auto",
    notice_version: mustReconfirm ? recording.noticeVersion + 1 : recording.noticeVersion,
    notice_text: customText,
    retention_months: months,
  };

  const { data: current } = await supabase
    .from("events")
    .select("settings")
    .eq("id", event.id)
    .single();
  const settings = { ...((current?.settings as Record<string, unknown> | null) ?? {}), recording: next };
  const { error } = await supabase.from("events").update({ settings }).eq("id", event.id);
  if (error) throw new Error(await adminMessage("recordingSaveFailed"));

  await logAudit(supabase, event.id, user.id, "configurar_grabacion", "events", event.id, next);
  refreshAll();
}

// ========== ALUMNADO ==========

async function updateStudentVisibilityActionRun(formData: FormData) {
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
  if (error) throw new Error(await adminMessage("studentsSaveFailed"));
  // Primera vez que se publican: aviso por correo al alumnado (una sola vez por espacio).
  const wasPublished = (current?.settings as { students?: { publish_results?: boolean } } | null)?.students?.publish_results;
  if (publishResults && !wasPublished) await sendResultsPublished(createAdminClient(), event.id);
  await logAudit(supabase, event.id, user.id, "visibilidad_alumnado", "events", event.id, {
    show_rubric: showRubric,
    publish_results: publishResults,
  });
  refreshAll();
}

// ========== ENTREGAS ==========

async function updateMaterialsSettingsActionRun(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const driveUrl = text(formData, "driveUrl");
  if (driveUrl && !/^https?:\/\//i.test(driveUrl)) {
    throw new Error(await adminMessage("driveHttps"));
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
  if (error) throw new Error(await adminMessage("materialsSaveFailed"));
  await logAudit(supabase, event.id, user.id, "configurar_entregas", "events", event.id, materials);
  refreshAll();
}

// ========== INTELIGENCIA ARTIFICIAL ==========

async function updateAiSettingsActionRun(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const rawInstructions = text(formData, "aiInstructions");
  if (rawInstructions.length > INSTRUCTIONS_MAX) {
    throw new Error(await adminMessage("aiTooLong", { max: INSTRUCTIONS_MAX }));
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
  if (error) throw new Error(await adminMessage("aiSaveFailed"));
  await logAudit(supabase, event.id, user.id, "configurar_ia", "events", event.id, ai);
  refreshAll();
}

// ========== AGENDA ==========

export type AgendaState = { ok: boolean; message: string } | null;

/** Genera la agenda desde Admin → Agenda (la lógica vive en buildAgenda). */
export async function generateAgendaAction(
  _previous: AgendaState,
  formData: FormData,
): Promise<AgendaState> {
  const session = await requireAdmin();
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
  if (!parsed.success) return { ok: false, message: await adminMessage("agendaInvalid") };

  const result = await buildAgenda(session, { ...parsed.data, rooms: parsed.data.rooms.split(",") });
  if (result.ok) refreshAll();
  return result;
}

/** Mueve un turno una posición arriba o abajo dentro de su sala y recalcula horas. */
async function moveSlotActionRun(formData: FormData) {
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

async function clearAgendaActionRun() {
  const { supabase, user, event } = await requireAdmin();
  await supabase.from("presentation_slots").delete().eq("event_id", event.id);
  await logAudit(supabase, event.id, user.id, "borrar_agenda", "presentation_slots", null);
  refreshAll();
}

async function updateTurnReminderActionRun(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const minutes = Number(text(formData, "turnMinutes"));
  if (!(TURN_REMINDER_OPTIONS as readonly number[]).includes(minutes)) return;
  const { data: current } = await supabase.from("events").select("settings").eq("id", event.id).single();
  const previous = (current?.settings as Record<string, unknown> | null) ?? {};
  const settings = {
    ...previous,
    notifications: { ...((previous.notifications as Record<string, unknown> | undefined) ?? {}), turn_minutes: minutes },
  };
  const { error } = await supabase.from("events").update({ settings }).eq("id", event.id);
  if (error) throw new Error(await adminMessage("agendaSaveFailed"));
  await logAudit(supabase, event.id, user.id, "aviso_turno", "events", event.id, { turn_minutes: minutes });
  refreshAll();
}

// ========== CÓDIGOS POR ROL ==========

/** Genera un código nuevo para el rol (el anterior deja de valer) o lo activa si no tenía. */
async function renewJoinCodeActionRun(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const role = asJoinableRole(text(formData, "role"));
  if (!role) return;
  const { data: current } = await supabase.from("events").select("signup_code").eq("id", event.id).single();
  await setJoinCodes(createAdminClient(), event.id, current?.signup_code ?? event.name, [role]);
  await logAudit(supabase, event.id, user.id, "codigo_rol_nuevo", "event_join_codes", event.id, { role });
  refreshAll();
}

/** Nadie más podrá entrar con ese rol usando un código. */
async function disableJoinCodeActionRun(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const role = asJoinableRole(text(formData, "role"));
  if (!role) return;
  await createAdminClient().from("event_join_codes").delete().eq("event_id", event.id).eq("role", role);
  await logAudit(supabase, event.id, user.id, "codigo_rol_desactivado", "event_join_codes", event.id, { role });
  refreshAll();
}

// ========== COEVALUACIÓN ==========

async function updatePeerReviewSettingsActionRun(formData: FormData) {
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
    weights: {
      teacher: number("weightTeacher", 0, 100, 80),
      peer: number("weightPeer", 0, 100, 20),
      self: number("weightSelf", 0, 100, 0),
    },
  };
  const { data: current } = await supabase.from("events").select("settings").eq("id", event.id).single();
  const settings = { ...((current?.settings as Record<string, unknown> | null) ?? {}), peer_review: peerReview };
  const { error } = await supabase.from("events").update({ settings }).eq("id", event.id);
  if (error) throw new Error(await adminMessage("peerSaveFailed"));
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
    return { ok: false, message: await adminMessage("peerNoStudents") };
  }
  if ((teams ?? []).length < 2) return { ok: false, message: await adminMessage("peerTwoUnits", { units: words.unitsLower }) };

  const assignments = assignPeerReviews(
    students,
    (teams ?? []).map((team) => team.id),
    Math.min(settings.reviewsPerStudent, (teams ?? []).length - 1),
  );
  const { error: deleteError } = await supabase.from("peer_assignments").delete().eq("event_id", event.id);
  if (deleteError) return { ok: false, message: await adminMessage("peerReplaceFailed") };
  const { error } = await supabase.from("peer_assignments").insert(
    assignments.map((item) => ({ event_id: event.id, reviewer_id: item.reviewerId, team_id: item.teamId })),
  );
  if (error) return { ok: false, message: await adminMessage("peerAssignFailed") };

  await logAudit(supabase, event.id, user.id, "repartir_coevaluacion", "peer_assignments", null, {
    students: students.length,
    assignments: assignments.length,
  });
  refreshAll();
  return {
    ok: true,
    message: await adminMessage("peerAssigned", { students: students.length, reviews: assignments.length }),
  };
}

// ========== PÚBLICO ==========

async function updatePublicVoteActionRun(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const publicVote = {
    open: formData.get("open") === "on",
    show_results: formData.get("showResults") === "on",
    title: text(formData, "title").slice(0, 120) || null,
  };
  const { data: current } = await supabase.from("events").select("settings").eq("id", event.id).single();
  const settings = { ...((current?.settings as Record<string, unknown> | null) ?? {}), public_vote: publicVote };
  const { error } = await supabase.from("events").update({ settings }).eq("id", event.id);
  if (error) throw new Error(await adminMessage("publicSaveFailed"));
  await logAudit(supabase, event.id, user.id, "configurar_voto_publico", "events", event.id, publicVote);
  refreshAll();
}

async function resetPublicVotesActionRun() {
  const { user, event, supabase } = await requireAdmin();
  // Los votos no tienen política de borrado para nadie: se borran con la clave de servicio.
  await createAdminClient().from("public_votes").delete().eq("event_id", event.id);
  await logAudit(supabase, event.id, user.id, "reiniciar_voto_publico", "public_votes", null);
  refreshAll();
}

// ========== RETOS ==========

async function saveChallengeActionRun(formData: FormData) {
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

async function deleteChallengeActionRun(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const id = text(formData, "id");
  const { count } = await supabase
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id)
    .eq("challenge_id", id);
  if (count) throw new Error(await adminMessage("challengeHasTeams"));

  await supabase.from("challenges").delete().eq("id", id).eq("event_id", event.id);
  await logAudit(supabase, event.id, user.id, "borrar_reto", "challenges", id);
  refreshAll();
}

// ========== EQUIPOS Y PARTICIPANTES ==========

async function saveTeamActionRun(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const id = text(formData, "id");
  const values = {
    name: text(formData, "name"),
    number: Number(text(formData, "number")) || null,
    // En asignaturas no hay retos: el grupo va sin reto.
    challenge_id: text(formData, "challengeId") || null,
    project_title: optional(formData, "projectTitle"),
    description: optional(formData, "description"),
    table_location: optional(formData, "tableLocation"),
  };
  if (!values.name) return;
  // Por personas: cada ficha es una persona, y ella misma es su único integrante.
  const individual = formData.get("individual") === "1";
  const email = text(formData, "email").toLowerCase() || null;
  if (individual && email && !z.string().email().safeParse(email).success) {
    throw new Error(await adminMessage("emailInvalid"));
  }

  let teamId = id;
  if (id) {
    await supabase.from("teams").update(values).eq("id", id).eq("event_id", event.id);
    await logAudit(supabase, event.id, user.id, "editar_equipo", "teams", id, values);
  } else {
    const { data } = await supabase.from("teams").insert({ ...values, event_id: event.id }).select("id").single();
    teamId = data?.id ?? "";
    await logAudit(supabase, event.id, user.id, "crear_equipo", "teams", data?.id ?? null, values);
  }
  if (individual && teamId) {
    const { data: members } = await supabase.from("team_members").select("id").eq("team_id", teamId).limit(1);
    const member = { full_name: values.name, email };
    const { error } = members?.[0]
      ? await supabase.from("team_members").update(member).eq("id", members[0].id).eq("event_id", event.id)
      : await supabase.from("team_members").insert({ ...member, event_id: event.id, team_id: teamId });
    if (error?.code === "23505") throw new Error(await adminMessage("emailInOtherGroup"));
  }
  refreshAll();
}

async function deleteTeamActionRun(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const id = text(formData, "id");
  const { count } = await supabase
    .from("evaluations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id)
    .eq("team_id", id);
  if (count) {
    throw new Error(await adminMessage("teamHasEvaluations"));
  }

  await supabase.from("teams").delete().eq("id", id).eq("event_id", event.id);
  await logAudit(supabase, event.id, user.id, "borrar_equipo", "teams", id);
  refreshAll();
}

async function addMemberActionRun(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const teamId = text(formData, "teamId");
  const fullName = text(formData, "fullName");
  const email = text(formData, "email").toLowerCase() || null;
  if (!fullName) return;
  if (email && !z.string().email().safeParse(email).success) {
    throw new Error(await adminMessage("emailInvalid"));
  }

  const { error } = await supabase
    .from("team_members")
    .insert({ event_id: event.id, team_id: teamId, full_name: fullName, email });
  if (error?.code === "23505") throw new Error(await adminMessage("emailInOtherGroup"));
  await logAudit(supabase, event.id, user.id, "añadir_participante", "teams", teamId, { fullName });
  refreshAll();
}

async function renameMemberActionRun(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const id = text(formData, "id");
  const fullName = text(formData, "fullName");
  const email = text(formData, "email").toLowerCase() || null;
  if (!fullName) return;
  if (email && !z.string().email().safeParse(email).success) {
    throw new Error(await adminMessage("emailInvalid"));
  }

  const { error } = await supabase
    .from("team_members")
    .update({ full_name: fullName, email })
    .eq("id", id)
    .eq("event_id", event.id);
  if (error?.code === "23505") throw new Error(await adminMessage("emailInOtherGroup"));
  await logAudit(supabase, event.id, user.id, "renombrar_participante", "team_members", id, { fullName });
  refreshAll();
}

async function removeMemberActionRun(formData: FormData) {
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
  if (!raw) return { ok: false, message: await adminMessage("importEmpty") };

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
    message: await adminMessage("importDone", { created, updated, members }),
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
    return { ok: false, message: await adminMessage("rosterInvalid") };
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
    if (error || !data) return { ok: false, message: await adminMessage("rosterCreateFailed", { name }) };
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
    if (error) return { ok: false, message: await adminMessage("rosterSaveFailed") };
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
  if (error) throw new Error(await adminMessage("logoFailed"));
  return supabase.storage.from("public-assets").getPublicUrl(path).data.publicUrl;
}

// ========== BIENVENIDA ==========

/** Oculta la guía de bienvenida del Inicio para esta persona y este espacio. */
async function hideWelcomeActionRun() {
  const { event } = await requireAdmin();
  (await cookies()).set(`welcome_hidden_${event.id.slice(0, 8)}`, "1", { maxAge: 60 * 60 * 24 * 365, path: "/" });
  refreshAll();
}

// ========== IMAGEN DEL ESPACIO ==========

/** Logo y color propios del espacio: salen en su portada y en el menú. */
async function updateBrandingActionRun(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const color = text(formData, "accentColor");
  const logo = await uploadLogo(formData.get("logo"), "logo-espacio");
  const values = {
    event_id: event.id,
    ...(/^#[0-9a-f]{6}$/i.test(color) ? { accent_color: color } : {}),
    ...(logo ? { logo_light_url: logo, logo_dark_url: logo } : {}),
    ...(formData.get("removeLogo") === "on" && !logo ? { logo_light_url: null, logo_dark_url: null } : {}),
  };
  const { error } = await supabase.from("event_branding").upsert(values, { onConflict: "event_id" });
  if (error) throw new Error(await adminMessage("brandingFailed"));
  await logAudit(supabase, event.id, user.id, "imagen_espacio", "event_branding", event.id, {
    color: values.accent_color ?? null,
    logo: Boolean(logo),
  });
  refreshAll();
}

async function saveSponsorActionRun(formData: FormData) {
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

async function deleteSponsorActionRun(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const id = text(formData, "id");
  await supabase.from("sponsors").delete().eq("id", id).eq("event_id", event.id);
  await logAudit(supabase, event.id, user.id, "borrar_patrocinador", "sponsors", id);
  refreshAll();
}

// ========== RESULTADO PARA LOS FORMULARIOS ==========

export type ActionResult = { error?: string } | void;

/**
 * Las acciones de los formularios devuelven el error en vez de lanzarlo: así
 * el formulario lo enseña como aviso y la página no se rompe (en producción,
 * Next oculta el texto de los errores lanzados). Las redirecciones siguen.
 */
async function guard(run: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await run();
  } catch (error) {
    unstable_rethrow(error);
    console.error("Acción de gestión fallida:", error instanceof Error ? error.message : error);
    return { error: error instanceof Error && error.message ? error.message : await adminMessage("generic") };
  }
}

export async function revokeInvitationAction(formData: FormData): Promise<ActionResult> {
  return guard(() => revokeInvitationActionRun(formData));
}

export async function setUserRoleAction(formData: FormData): Promise<ActionResult> {
  return guard(() => setUserRoleActionRun(formData));
}

export async function toggleUserDisabledAction(formData: FormData): Promise<ActionResult> {
  return guard(() => toggleUserDisabledActionRun(formData));
}

export async function updateEventAction(formData: FormData): Promise<ActionResult> {
  return guard(() => updateEventActionRun(formData));
}

export async function updateRecordingSettingsAction(formData: FormData): Promise<ActionResult> {
  return guard(() => updateRecordingSettingsActionRun(formData));
}

export async function updateStudentVisibilityAction(formData: FormData): Promise<ActionResult> {
  return guard(() => updateStudentVisibilityActionRun(formData));
}

export async function updateMaterialsSettingsAction(formData: FormData): Promise<ActionResult> {
  return guard(() => updateMaterialsSettingsActionRun(formData));
}

export async function updateAiSettingsAction(formData: FormData): Promise<ActionResult> {
  return guard(() => updateAiSettingsActionRun(formData));
}

export async function moveSlotAction(formData: FormData): Promise<ActionResult> {
  return guard(() => moveSlotActionRun(formData));
}

export async function clearAgendaAction(): Promise<ActionResult> {
  return guard(() => clearAgendaActionRun());
}

export async function updateTurnReminderAction(formData: FormData): Promise<ActionResult> {
  return guard(() => updateTurnReminderActionRun(formData));
}

export async function renewJoinCodeAction(formData: FormData): Promise<ActionResult> {
  return guard(() => renewJoinCodeActionRun(formData));
}

export async function disableJoinCodeAction(formData: FormData): Promise<ActionResult> {
  return guard(() => disableJoinCodeActionRun(formData));
}

export async function updatePeerReviewSettingsAction(formData: FormData): Promise<ActionResult> {
  return guard(() => updatePeerReviewSettingsActionRun(formData));
}

export async function updatePublicVoteAction(formData: FormData): Promise<ActionResult> {
  return guard(() => updatePublicVoteActionRun(formData));
}

export async function resetPublicVotesAction(): Promise<ActionResult> {
  return guard(() => resetPublicVotesActionRun());
}

export async function saveChallengeAction(formData: FormData): Promise<ActionResult> {
  return guard(() => saveChallengeActionRun(formData));
}

export async function deleteChallengeAction(formData: FormData): Promise<ActionResult> {
  return guard(() => deleteChallengeActionRun(formData));
}

export async function saveTeamAction(formData: FormData): Promise<ActionResult> {
  return guard(() => saveTeamActionRun(formData));
}

export async function deleteTeamAction(formData: FormData): Promise<ActionResult> {
  return guard(() => deleteTeamActionRun(formData));
}

export async function addMemberAction(formData: FormData): Promise<ActionResult> {
  return guard(() => addMemberActionRun(formData));
}

export async function renameMemberAction(formData: FormData): Promise<ActionResult> {
  return guard(() => renameMemberActionRun(formData));
}

export async function removeMemberAction(formData: FormData): Promise<ActionResult> {
  return guard(() => removeMemberActionRun(formData));
}

export async function hideWelcomeAction(): Promise<ActionResult> {
  return guard(() => hideWelcomeActionRun());
}

export async function updateBrandingAction(formData: FormData): Promise<ActionResult> {
  return guard(() => updateBrandingActionRun(formData));
}

export async function saveSponsorAction(formData: FormData): Promise<ActionResult> {
  return guard(() => saveSponsorActionRun(formData));
}

export async function deleteSponsorAction(formData: FormData): Promise<ActionResult> {
  return guard(() => deleteSponsorActionRun(formData));
}

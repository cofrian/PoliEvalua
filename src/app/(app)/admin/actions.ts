"use server";

import { createHash, randomBytes } from "node:crypto";
import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { logAudit } from "@/lib/app/audit";
import { getSession } from "@/lib/app/session";

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
  if (!fullName) return;

  await supabase.from("team_members").insert({ event_id: event.id, team_id: teamId, full_name: fullName });
  await logAudit(supabase, event.id, user.id, "añadir_participante", "teams", teamId, { fullName });
  refreshAll();
}

export async function renameMemberAction(formData: FormData) {
  const { supabase, user, event } = await requireAdmin();
  const id = text(formData, "id");
  const fullName = text(formData, "fullName");
  if (!fullName) return;

  await supabase.from("team_members").update({ full_name: fullName }).eq("id", id).eq("event_id", event.id);
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

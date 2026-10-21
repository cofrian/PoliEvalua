"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  evaluationProposalSchema,
  normalizeEvaluationProposal,
} from "@/lib/ai/evaluation-proposal";
import { clearAttempts, clientIp, isBlocked, recordAttempt } from "@/lib/auth/rate-limit";
import { getAccount } from "@/lib/app/session";
import { createAdminClient } from "@/lib/supabase/admin";

const participantRoleSchema = z.enum(["judge", "mentor", "teacher", "student", "reviewer", "viewer"]);
const joinRoleSchema = z.enum(["judge", "mentor", "student", "reviewer", "viewer"]);
const moduleSchema = z.enum(["participants", "rubric", "notes", "results", "sponsors"]);

const spaceSchema = z
  .object({
    name: z.string().trim().min(3).max(100),
    slug: z.string().trim().toLowerCase().min(3).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    kind: z.enum(["hackathon", "class", "awards", "project", "custom"]),
    accessCode: z.string().trim().min(6).max(40),
    description: z.string().trim().max(500).optional(),
    participantMode: z.enum(["teams", "groups", "individuals", "candidates"]),
    evaluationMode: z.enum(["rubric", "feedback", "mixed"]),
    enabledRoles: z.array(participantRoleSchema).min(1),
    joinRoles: z.array(joinRoleSchema),
    modules: z.array(moduleSchema).min(1),
    academicEnabled: z.boolean(),
    institution: z.string().trim().max(160).optional(),
    school: z.string().trim().max(160).optional(),
    degree: z.string().trim().max(160).optional(),
    subjectName: z.string().trim().max(160).optional(),
    subjectCode: z.string().trim().max(60).optional(),
    academicYear: z.string().trim().max(40).optional(),
    term: z.string().trim().max(80).optional(),
  })
  .refine(
    (data) => data.joinRoles.every((role) => data.enabledRoles.includes(role)),
    { message: "Los perfiles con código deben estar habilitados.", path: ["joinRoles"] },
  )
  .refine(
    (data) => !data.academicEnabled || (data.subjectName?.length ?? 0) >= 2,
    { message: "Indica la asignatura del espacio académico.", path: ["subjectName"] },
  );

export type CreateSpaceState = {
  error?: string;
};

export type JoinSpaceState = {
  error?: string;
};

async function setActiveSpace(eventId: string) {
  const cookieStore = await cookies();
  cookieStore.set("active_event_id", eventId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function selectSpaceAction(formData: FormData) {
  const { supabase, user } = await getAccount();
  const eventId = String(formData.get("eventId") ?? "");
  const { data: membership } = await supabase
    .from("event_members")
    .select("event_id")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) throw new Error("No tienes acceso activo a este espacio.");
  await setActiveSpace(membership.event_id);
  redirect("/equipos");
}

export async function joinSpaceAction(
  _previousState: JoinSpaceState,
  formData: FormData,
): Promise<JoinSpaceState> {
  const parsed = z
    .object({
      accessCode: z.string().trim().min(6).max(40),
      role: joinRoleSchema,
    })
    .safeParse({
      accessCode: formData.get("accessCode"),
      role: formData.get("role"),
    });

  if (!parsed.success) return { error: "Revisa el código y el rol." };

  const { user } = await getAccount();
  const admin = createAdminClient();
  const attemptKeys = [`ip:${await clientIp()}`, `user:${user.id}`];
  if (await isBlocked(admin, "bad_code", attemptKeys)) {
    return { error: "Demasiados intentos. Espera unos minutos." };
  }

  const { data: event } = await admin
    .from("events")
    .select("id, settings")
    .eq("signup_code", parsed.data.accessCode.toUpperCase())
    .eq("signup_open", true)
    .maybeSingle();

  if (!event) {
    await recordAttempt(admin, "bad_code", attemptKeys);
    return { error: "El código no es válido o el acceso está cerrado." };
  }

  const settings = event.settings as { join_roles?: string[] } | null;
  const allowedRoles = Array.isArray(settings?.join_roles)
    ? settings.join_roles
    : ["judge", "mentor"];
  if (!allowedRoles.includes(parsed.data.role)) {
    return { error: "Ese perfil no está habilitado para entrar con código en este espacio." };
  }

  const { data: current } = await admin
    .from("event_members")
    .select("status")
    .eq("event_id", event.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (current?.status === "inactive") {
    return { error: "Tu acceso a este espacio está desactivado. Contacta con su gestor." };
  }

  if (!current) {
    const { error } = await admin.from("event_members").insert({
      event_id: event.id,
      user_id: user.id,
      role: parsed.data.role,
      status: "active",
    });
    if (error) return { error: "No se ha podido añadir el espacio a tu cuenta." };
  }

  await clearAttempts(admin, "bad_code", attemptKeys);
  await setActiveSpace(event.id);
  redirect("/equipos");
}

export async function createSpaceAction(
  _previousState: CreateSpaceState,
  formData: FormData,
): Promise<CreateSpaceState> {
  const parsed = spaceSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    kind: formData.get("kind"),
    accessCode: formData.get("accessCode"),
    description: formData.get("description"),
    participantMode: formData.get("participantMode"),
    evaluationMode: formData.get("evaluationMode"),
    enabledRoles: formData.getAll("enabledRoles"),
    joinRoles: formData.getAll("joinRoles"),
    modules: formData.getAll("modules"),
    academicEnabled: formData.get("academicEnabled") === "on",
    institution: formData.get("institution") ?? undefined,
    school: formData.get("school") ?? undefined,
    degree: formData.get("degree") ?? undefined,
    subjectName: formData.get("subjectName") ?? undefined,
    subjectCode: formData.get("subjectCode") ?? undefined,
    academicYear: formData.get("academicYear") ?? undefined,
    term: formData.get("term") ?? undefined,
  });

  if (!parsed.success) {
    return {
      error:
        "Revisa la identidad, los perfiles, las funciones seleccionadas y el código (mínimo 6 caracteres).",
    };
  }

  const { supabase, user } = await getAccount();
  const { data, error } = await supabase.rpc("create_event_space", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_kind: parsed.data.kind,
    p_signup_code: parsed.data.accessCode.toUpperCase(),
    p_description: parsed.data.description || null,
    p_settings: {
      participant_mode: parsed.data.participantMode,
      evaluation_mode: parsed.data.evaluationMode,
      enabled_roles: parsed.data.enabledRoles,
      join_roles: parsed.data.joinRoles,
      modules: parsed.data.modules,
      academic: parsed.data.academicEnabled
        ? {
            institution:
              parsed.data.institution || "Universitat Politècnica de València",
            school: parsed.data.school || null,
            degree: parsed.data.degree || null,
            subject_name: parsed.data.subjectName,
            subject_code: parsed.data.subjectCode || null,
            academic_year: parsed.data.academicYear || null,
            term: parsed.data.term || null,
          }
        : null,
    },
  });

  if (error || typeof data !== "string") {
    const duplicate = error?.message.toLowerCase().includes("duplicate");
    return {
      error: duplicate
        ? "Ese identificador o código de acceso ya está en uso."
        : "No se ha podido crear el espacio. Inténtalo de nuevo.",
    };
  }

  await setActiveSpace(data);

  const proposal = parseAssistantProposal(formData.get("assistantProposal"));
  if (proposal) {
    const { error: proposalError } = await supabase.from("assistant_proposals").insert({
      event_id: data,
      user_id: user.id,
      prompt: String(formData.get("assistantPrompt") ?? "").slice(0, 4000) || "Creación guiada",
      reply: "Propuesta generada al crear el espacio.",
      proposal: normalizeEvaluationProposal(proposal),
      status: "pending",
      model: String(formData.get("assistantModel") ?? "").slice(0, 120) || null,
    });
    if (!proposalError) redirect("/admin/asistente");
  }

  redirect("/admin");
}

export type DuplicateSpaceState = { error?: string };

/**
 * Crea un espacio nuevo con la configuración de otro (rúbrica, página de
 * evaluación, datos académicos, paneles y ajustes), sin personas ni datos.
 */
export async function duplicateSpaceAction(
  _previousState: DuplicateSpaceState,
  formData: FormData,
): Promise<DuplicateSpaceState> {
  const parsed = z
    .object({
      sourceId: z.string().uuid(),
      name: z.string().trim().min(3).max(100),
      slug: z.string().trim().toLowerCase().min(3).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      accessCode: z.string().trim().min(6).max(40),
    })
    .safeParse({
      sourceId: formData.get("sourceId"),
      name: formData.get("name"),
      slug: formData.get("slug"),
      accessCode: formData.get("accessCode"),
    });
  if (!parsed.success) {
    return { error: "Revisa el nombre, el identificador (minúsculas y guiones) y el código (mínimo 6)." };
  }

  const { supabase } = await getAccount();
  const { data, error } = await supabase.rpc("duplicate_event_space", {
    source_event: parsed.data.sourceId,
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_signup_code: parsed.data.accessCode,
  });
  if (error || typeof data !== "string") {
    return {
      error: error?.message.toLowerCase().includes("duplicate")
        ? "Ese identificador o código de acceso ya está en uso."
        : "No se ha podido duplicar el espacio.",
    };
  }

  await setActiveSpace(data);
  redirect("/admin");
}

function parseAssistantProposal(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = evaluationProposalSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

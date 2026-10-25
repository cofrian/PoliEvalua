"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  evaluationProposalSchema,
  normalizeEvaluationProposal,
} from "@/lib/ai/evaluation-proposal";
import { clearAttempts, clientIp, isBlocked, recordAttempt } from "@/lib/auth/rate-limit";
import { setJoinCodes } from "@/lib/app/join-codes";
import { getAccount } from "@/lib/app/session";
import { createAdminClient } from "@/lib/supabase/admin";

const participantRoleSchema = z.enum(["judge", "mentor", "teacher", "student", "reviewer", "viewer"]);
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
    joinRoles: z.array(z.enum(["judge", "mentor", "student", "reviewer", "viewer"])),
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
    { message: "joinRolesEnabled", path: ["joinRoles"] },
  )
  .refine(
    (data) => !data.academicEnabled || (data.subjectName?.length ?? 0) >= 2,
    { message: "subjectRequired", path: ["subjectName"] },
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

  if (!membership) throw new Error((await getTranslations("spaceErrors"))("noAccess"));
  await setActiveSpace(membership.event_id);
  redirect("/equipos");
}

export async function joinSpaceAction(
  _previousState: JoinSpaceState,
  formData: FormData,
): Promise<JoinSpaceState> {
  const t = await getTranslations("spaceErrors");
  const parsed = z
    .object({ accessCode: z.string().trim().min(6).max(60) })
    .safeParse({ accessCode: formData.get("accessCode") });

  if (!parsed.success) return { error: t("checkCode") };

  const { user } = await getAccount();
  const admin = createAdminClient();
  const attemptKeys = [`ip:${await clientIp()}`, `user:${user.id}`];
  if (await isBlocked(admin, "bad_code", attemptKeys)) {
    return { error: t("tooMany") };
  }

  // Cada rol tiene su código: quien lo tiene entra con ese rol y no puede elegir otro.
  const { data: match } = await admin
    .from("event_join_codes")
    .select("event_id, role, events!inner(signup_open)")
    .ilike("code", parsed.data.accessCode.replace(/[\\%_]/g, "\\$&"))
    .eq("events.signup_open", true)
    .maybeSingle();

  if (!match) {
    await recordAttempt(admin, "bad_code", attemptKeys);
    return { error: t("badCode") };
  }

  const { data: current } = await admin
    .from("event_members")
    .select("role, status")
    .eq("event_id", match.event_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (current?.status === "inactive") {
    return { error: t("inactive") };
  }

  if (!current) {
    const { error } = await admin.from("event_members").insert({
      event_id: match.event_id,
      user_id: user.id,
      role: match.role,
      status: "active",
    });
    if (error) return { error: t("addFailed") };
  } else if (current.role !== match.role && !["owner", "manager"].includes(current.role)) {
    // Ya estaba con otro rol: el código nuevo le da los permisos de ese rol.
    const { error } = await admin
      .from("event_members")
      .update({ role: match.role })
      .eq("event_id", match.event_id)
      .eq("user_id", user.id);
    if (error) return { error: t("addFailed") };
  }

  await clearAttempts(admin, "bad_code", attemptKeys);
  await setActiveSpace(match.event_id);
  redirect("/equipos");
}

export async function createSpaceAction(
  _previousState: CreateSpaceState,
  formData: FormData,
): Promise<CreateSpaceState> {
  const t = await getTranslations("spaceErrors");
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
      error: t("checkCreate"),
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
        ? t("inUse")
        : t("createFailed"),
    };
  }

  await setJoinCodes(createAdminClient(), data, parsed.data.accessCode, parsed.data.joinRoles);
  await setActiveSpace(data);
  // El espacio nace en el idioma con el que se ha creado (IA, votación pública…),
  // y la base de datos pone en castellano la rúbrica y la página de evaluación.
  const locale = await getLocale();
  await supabase.from("events").update({ locale }).eq("id", data);
  if (locale !== "es") {
    const tDefaults = await getTranslations("spaceDefaults");
    await Promise.all([
      supabase.from("rubrics").update({ name: tDefaults("rubric") }).eq("event_id", data),
      supabase
        .from("evaluation_pages")
        .update({ title: tDefaults("evaluationPage", { space: parsed.data.name }) })
        .eq("event_id", data),
    ]);
  }

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
  const t = await getTranslations("spaceErrors");
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
    return { error: t("checkDuplicate") };
  }

  const { supabase } = await getAccount();
  const { data, error } = await supabase.rpc("duplicate_event_space", {
    source_event: parsed.data.sourceId,
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_signup_code: parsed.data.accessCode.toUpperCase(),
  });
  if (error || typeof data !== "string") {
    return {
      error: error?.message.toLowerCase().includes("duplicate")
        ? t("inUse")
        : t("duplicateFailed"),
    };
  }

  const admin = createAdminClient();
  const { data: sourceCodes } = await admin.from("event_join_codes").select("role").eq("event_id", parsed.data.sourceId);
  await setJoinCodes(admin, data, parsed.data.accessCode, (sourceCodes ?? []).map((row) => row.role));

  // El duplicado conserva el idioma del original.
  const { data: source } = await supabase.from("events").select("locale").eq("id", parsed.data.sourceId).maybeSingle();
  if (source?.locale) await supabase.from("events").update({ locale: source.locale }).eq("id", data);

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

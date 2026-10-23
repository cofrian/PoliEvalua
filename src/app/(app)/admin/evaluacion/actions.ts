"use server";

import { adminMessage } from "@/lib/app/admin-messages";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAudit } from "@/lib/app/audit";
import { getSession } from "@/lib/app/session";
import { evaluationProposalSchema } from "@/lib/ai/evaluation-proposal";

async function requireManager() {
  const session = await getSession();
  if (!session.isAdmin) throw new Error(await adminMessage("onlyAdmin"));
  return session;
}

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function optional(formData: FormData, key: string) {
  return value(formData, key) || null;
}

function list(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

const evaluationSettingsSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().max(2000).nullable(),
  instructions: z.string().max(4000).nullable(),
  status: z.enum(["draft", "published", "closed"]),
  aggregationMethod: z.enum(["average", "consensus", "hybrid", "trimmed_mean"]),
  minEvaluations: z.coerce.number().int().min(1).max(20),
  currentRound: z.coerce.number().int().min(1).max(20),
  opensAt: z.string().nullable(),
  closesAt: z.string().nullable(),
  requirements: z.array(z.string().min(2).max(240)).max(30),
  questions: z.array(z.string().min(2).max(240)).max(30),
});

export async function saveEvaluationSettingsAction(formData: FormData) {
  const { supabase, user, event } = await requireManager();
  const parsed = evaluationSettingsSchema.parse({
    title: value(formData, "title"),
    description: optional(formData, "description"),
    instructions: optional(formData, "instructions"),
    status: formData.get("status"),
    aggregationMethod: formData.get("aggregationMethod"),
    minEvaluations: formData.get("minEvaluations"),
    currentRound: formData.get("currentRound"),
    opensAt: optional(formData, "opensAt"),
    closesAt: optional(formData, "closesAt"),
    requirements: list(value(formData, "requirements")),
    questions: list(value(formData, "questions")),
  });

  const requirements = parsed.requirements.map((label, index) => ({
    key: `requisito-${index + 1}`,
    label,
    description: null,
    required: true,
  }));
  const questions = parsed.questions.map((label, index) => ({
    key: `pregunta-${index + 1}`,
    label,
    description: null,
    type: "textarea",
    required: false,
    options: [],
  }));

  const { error } = await supabase.from("evaluation_pages").upsert(
    {
      event_id: event.id,
      title: parsed.title,
      description: parsed.description,
      instructions: parsed.instructions,
      status: parsed.status,
      aggregation_method: parsed.aggregationMethod,
      min_evaluations: parsed.minEvaluations,
      current_round: parsed.currentRound,
      opens_at: parsed.opensAt ? new Date(parsed.opensAt).toISOString() : null,
      closes_at: parsed.closesAt ? new Date(parsed.closesAt).toISOString() : null,
      requirements,
      questions,
    },
    { onConflict: "event_id" },
  );
  if (error) throw new Error(await adminMessage("evaluationSaveFailed"));

  await logAudit(
    supabase,
    event.id,
    user.id,
    "configurar_evaluacion",
    "evaluation_pages",
    null,
    { title: parsed.title, status: parsed.status },
  );
  revalidatePath("/", "layout");
}

const academicSchema = z.object({
  institution: z.string().min(2).max(160),
  school: z.string().max(160).nullable(),
  degree: z.string().max(160).nullable(),
  subjectName: z.string().min(2).max(160),
  subjectCode: z.string().max(60).nullable(),
  academicYear: z.string().max(40).nullable(),
  term: z.string().max(80).nullable(),
});

export async function saveAcademicContextAction(formData: FormData) {
  const { supabase, user, event } = await requireManager();
  const parsed = academicSchema.parse({
    institution: value(formData, "institution"),
    school: optional(formData, "school"),
    degree: optional(formData, "degree"),
    subjectName: value(formData, "subjectName"),
    subjectCode: optional(formData, "subjectCode"),
    academicYear: optional(formData, "academicYear"),
    term: optional(formData, "term"),
  });

  const { error } = await supabase.from("event_academic_contexts").upsert(
    {
      event_id: event.id,
      institution: parsed.institution,
      school: parsed.school,
      degree: parsed.degree,
      subject_name: parsed.subjectName,
      subject_code: parsed.subjectCode,
      academic_year: parsed.academicYear,
      term: parsed.term,
    },
    { onConflict: "event_id" },
  );
  if (error) throw new Error(await adminMessage("academicSaveFailed"));

  await logAudit(
    supabase,
    event.id,
    user.id,
    "actualizar_contexto_academico",
    "event_academic_contexts",
    event.id,
    { subjectName: parsed.subjectName, degree: parsed.degree },
  );
  revalidatePath("/", "layout");
}

const proposalIdSchema = z.string().uuid();

export async function applyAssistantProposalAction(formData: FormData) {
  const { supabase, user, event } = await requireManager();
  const proposalId = proposalIdSchema.parse(formData.get("proposalId"));
  const { data: row } = await supabase
    .from("assistant_proposals")
    .select("id, proposal, status")
    .eq("id", proposalId)
    .eq("event_id", event.id)
    .maybeSingle();

  if (!row || row.status !== "pending") {
    throw new Error(await adminMessage("proposalNotPending"));
  }
  const proposal = evaluationProposalSchema.parse(row.proposal);
  const { error } = await supabase.rpc("apply_evaluation_proposal", {
    p_event_id: event.id,
    p_proposal: proposal,
  });
  if (error) throw new Error(error.message);

  if (proposal.jury.enabled && proposal.jury.panelNames.length) {
    await supabase.from("jury_panels").upsert(
      proposal.jury.panelNames.map((name, index) => ({
        event_id: event.id,
        name,
        order: index,
        active: true,
      })),
      { onConflict: "event_id,name" },
    );
  }

  await supabase
    .from("assistant_proposals")
    .update({ status: "applied", applied_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("event_id", event.id);
  await logAudit(
    supabase,
    event.id,
    user.id,
    "aplicar_propuesta_asistente",
    "assistant_proposals",
    proposalId,
    { evaluationTitle: proposal.evaluation.title },
  );
  revalidatePath("/", "layout");
  redirect("/admin/evaluacion?applied=1");
}

export async function rejectAssistantProposalAction(formData: FormData) {
  const { supabase, user, event } = await requireManager();
  const proposalId = proposalIdSchema.parse(formData.get("proposalId"));
  await supabase
    .from("assistant_proposals")
    .update({ status: "rejected" })
    .eq("id", proposalId)
    .eq("event_id", event.id)
    .eq("status", "pending");
  await logAudit(
    supabase,
    event.id,
    user.id,
    "rechazar_propuesta_asistente",
    "assistant_proposals",
    proposalId,
  );
  revalidatePath("/admin/asistente");
  redirect("/admin/asistente");
}


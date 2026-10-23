"use server";

import { adminMessage } from "@/lib/app/admin-messages";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { logAudit } from "@/lib/app/audit";
import { getSession } from "@/lib/app/session";

async function requireManager() {
  const session = await getSession();
  if (!session.isAdmin) throw new Error(await adminMessage("onlyAdmin"));
  return session;
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

const uuidSchema = z.string().uuid();

async function savePanelActionRun(formData: FormData) {
  const { supabase, user, event } = await requireManager();
  const id = text(formData, "id");
  const name = z.string().min(2).max(100).parse(text(formData, "name"));
  const description = text(formData, "description") || null;
  const order = Math.max(0, Number(text(formData, "order")) || 0);
  let entityId = id || null;

  if (id) {
    uuidSchema.parse(id);
    const { error } = await supabase
      .from("jury_panels")
      .update({ name, description, order, active: true })
      .eq("id", id)
      .eq("event_id", event.id);
    if (error) throw new Error(await adminMessage("panelUpdateFailed"));
  } else {
    const { data, error } = await supabase
      .from("jury_panels")
      .insert({ event_id: event.id, name, description, order })
      .select("id")
      .single();
    if (error || !data) throw new Error(await adminMessage("panelCreateFailed"));
    entityId = data.id;
  }

  await logAudit(supabase, event.id, user.id, id ? "editar_panel" : "crear_panel", "jury_panels", entityId, { name });
  revalidatePath("/admin/paneles");
}

async function deactivatePanelActionRun(formData: FormData) {
  const { supabase, user, event } = await requireManager();
  const id = uuidSchema.parse(formData.get("id"));
  await supabase
    .from("jury_panels")
    .update({ active: false })
    .eq("id", id)
    .eq("event_id", event.id);
  await logAudit(supabase, event.id, user.id, "desactivar_panel", "jury_panels", id);
  revalidatePath("/admin/paneles");
}

async function updatePanelMembersActionRun(formData: FormData) {
  const { supabase, user, event } = await requireManager();
  const panelId = uuidSchema.parse(formData.get("panelId"));
  const requested = formData.getAll("members").map(String);
  requested.forEach((id) => uuidSchema.parse(id));

  const { data: eligible } = await supabase
    .from("event_members")
    .select("user_id")
    .eq("event_id", event.id)
    .eq("status", "active")
    .in("role", ["owner", "manager", "judge", "reviewer", "teacher"])
    .in("user_id", requested.length ? requested : ["00000000-0000-0000-0000-000000000000"]);
  const allowed = (eligible ?? []).map((member) => member.user_id);

  await supabase
    .from("jury_panel_members")
    .delete()
    .eq("event_id", event.id)
    .eq("panel_id", panelId);
  if (allowed.length) {
    const { error } = await supabase.from("jury_panel_members").insert(
      allowed.map((userId) => ({ event_id: event.id, panel_id: panelId, user_id: userId })),
    );
    if (error) throw new Error(await adminMessage("panelMembersFailed"));
  }
  await logAudit(supabase, event.id, user.id, "asignar_jurado_panel", "jury_panels", panelId, { members: allowed.length });
  revalidatePath("/admin/paneles");
}

async function updatePanelTeamsActionRun(formData: FormData) {
  const { supabase, user, event } = await requireManager();
  const panelId = uuidSchema.parse(formData.get("panelId"));
  const round = z.coerce.number().int().min(1).max(20).parse(formData.get("round"));
  const teams = formData.getAll("teams").map(String);
  teams.forEach((id) => uuidSchema.parse(id));

  await supabase
    .from("jury_panel_assignments")
    .delete()
    .eq("event_id", event.id)
    .eq("panel_id", panelId)
    .eq("round", round);
  if (teams.length) {
    const { error } = await supabase.from("jury_panel_assignments").insert(
      teams.map((teamId) => ({ event_id: event.id, panel_id: panelId, team_id: teamId, round })),
    );
    if (error) throw new Error(await adminMessage("panelTeamsFailed"));
  }
  await logAudit(supabase, event.id, user.id, "asignar_proyectos_panel", "jury_panels", panelId, { teams: teams.length, round });
  revalidatePath("/admin/paneles");
}

async function autoAssignPanelsActionRun(formData: FormData) {
  const { supabase, user, event } = await requireManager();
  const round = z.coerce.number().int().min(1).max(20).parse(formData.get("round"));
  const [{ data: panels }, { data: teams }] = await Promise.all([
    supabase.from("jury_panels").select("id").eq("event_id", event.id).eq("active", true).order("order"),
    supabase.from("teams").select("id").eq("event_id", event.id).order("number"),
  ]);
  if (!panels?.length) throw new Error(await adminMessage("panelNone"));

  await supabase
    .from("jury_panel_assignments")
    .delete()
    .eq("event_id", event.id)
    .eq("round", round);
  const rows = (teams ?? []).map((team, index) => ({
    event_id: event.id,
    panel_id: panels[index % panels.length].id,
    team_id: team.id,
    round,
  }));
  if (rows.length) {
    const { error } = await supabase.from("jury_panel_assignments").insert(rows);
    if (error) throw new Error(await adminMessage("panelAutoFailed"));
  }
  await logAudit(supabase, event.id, user.id, "repartir_proyectos_paneles", "jury_panel_assignments", null, { teams: rows.length, panels: panels.length, round });
  revalidatePath("/admin/paneles");
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

export async function savePanelAction(formData: FormData): Promise<ActionResult> {
  return guard(() => savePanelActionRun(formData));
}

export async function deactivatePanelAction(formData: FormData): Promise<ActionResult> {
  return guard(() => deactivatePanelActionRun(formData));
}

export async function updatePanelMembersAction(formData: FormData): Promise<ActionResult> {
  return guard(() => updatePanelMembersActionRun(formData));
}

export async function updatePanelTeamsAction(formData: FormData): Promise<ActionResult> {
  return guard(() => updatePanelTeamsActionRun(formData));
}

export async function autoAssignPanelsAction(formData: FormData): Promise<ActionResult> {
  return guard(() => autoAssignPanelsActionRun(formData));
}

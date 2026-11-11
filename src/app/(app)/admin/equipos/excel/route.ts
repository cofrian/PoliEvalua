import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

import { getSession } from "@/lib/app/session";

/** Excel con los grupos del espacio: una fila por integrante. Solo gestión. */
export async function GET() {
  const { supabase, realAdmin, event, words } = await getSession();
  if (!realAdmin) return new NextResponse("No autorizado", { status: 403 });
  const t = await getTranslations("teamsExcel");

  const [{ data: challenges }, { data: teams }, { data: extra }] = await Promise.all([
    supabase.from("challenges").select("id, name").eq("event_id", event.id).order("order"),
    supabase
      .from("teams")
      .select("id, number, name, challenge_id, project_title, team_members(full_name, email)")
      .eq("event_id", event.id)
      .order("number"),
    supabase.from("team_challenges").select("team_id, challenge_id").eq("event_id", event.id),
  ]);
  const challengeName = new Map((challenges ?? []).map((c) => [c.id, c.name]));

  const book = new ExcelJS.Workbook();
  book.creator = "PoliEvalúa";
  const sheet = book.addWorksheet(words.units.slice(0, 31));
  sheet.columns = [
    { header: t("number"), key: "number", width: 6 },
    { header: words.unit, key: "team", width: 30 },
    ...(challenges?.length ? [{ header: t("challenges"), key: "challenges", width: 30 }] : []),
    { header: t("project"), key: "project", width: 30 },
    { header: t("member"), key: "member", width: 32 },
    { header: t("email"), key: "email", width: 34 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const team of teams ?? []) {
    const ids = [team.challenge_id, ...(extra ?? []).filter((r) => r.team_id === team.id).map((r) => r.challenge_id)];
    const base = {
      number: team.number ?? "",
      team: team.name,
      challenges: ids.map((id) => (id ? challengeName.get(id) : null)).filter(Boolean).join(", "),
      project: team.project_title ?? "",
    };
    const members = [...((team.team_members ?? []) as { full_name: string; email: string | null }[])].sort((a, b) =>
      a.full_name.localeCompare(b.full_name, "es"),
    );
    if (!members.length) sheet.addRow({ ...base, member: "", email: "" });
    for (const member of members) sheet.addRow({ ...base, member: member.full_name, email: member.email ?? "" });
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };

  const buffer = await book.xlsx.writeBuffer();
  const name = `${event.slug ?? "equipos"}-${words.unitsLower}.xlsx`.replace(/[^\w.-]+/g, "-");
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

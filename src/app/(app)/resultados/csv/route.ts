import Papa from "papaparse";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("No autorizado", { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, disabled")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin" || profile.disabled) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const [{ data: totals }, { data: teams }, { data: challenges }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("evaluation_totals")
        .select("team_id, judge_id, status, total")
        .eq("status", "submitted"),
      supabase.from("teams").select("id, number, name, challenge_id"),
      supabase.from("challenges").select("id, name"),
      supabase.from("profiles").select("id, full_name"),
    ]);

  const rows = (totals ?? []).map((row) => {
    const team = teams?.find((t) => t.id === row.team_id);
    return {
      reto: challenges?.find((c) => c.id === team?.challenge_id)?.name ?? "",
      equipo_numero: team?.number ?? "",
      equipo: team?.name ?? "",
      juez: profiles?.find((p) => p.id === row.judge_id)?.full_name ?? "",
      total: row.total,
    };
  });

  return new NextResponse("﻿" + Papa.unparse(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="resultados-valencia-hack.csv"',
    },
  });
}

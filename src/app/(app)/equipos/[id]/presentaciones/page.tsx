import { ArrowLeft, Mic2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  PresentationStudio,
  type PresentationRecord,
} from "@/components/app/presentation-studio";
import { getSession } from "@/lib/app/session";

export default async function TeamPresentationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, role, isAdmin, event } = await getSession();

  const [{ data: team }, { data: recordings }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, number, name, project_title")
      .eq("id", id)
      .eq("event_id", event.id)
      .maybeSingle(),
    supabase
      .from("presentation_recordings")
      .select(
        "id, title, status, visibility, duration_seconds, size_bytes, transcript, summary, key_points, outline, action_items, mind_map, error_message, audio_deleted_at, created_at, created_by, creator:profiles!presentation_recordings_created_by_fkey(full_name)",
      )
      .eq("event_id", event.id)
      .eq("team_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (!team) notFound();

  return (
    <div className="space-y-6">
      <Link
        className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
        href={`/equipos/${team.id}`}
      >
        <ArrowLeft className="size-4" /> Volver al proyecto
      </Link>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-muted-foreground">
            Equipo #{team.number} · {team.name}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl">
            Exposiciones y materiales
          </h1>
          {team.project_title ? (
            <p className="mt-1 text-muted-foreground">{team.project_title}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">
          <ShieldCheck className="size-4 text-leaf-500" /> Aislado en {event.name}
        </div>
      </header>

      <PresentationStudio
        canCreate={role !== "viewer"}
        canManage={isAdmin}
        initialRecords={(recordings ?? []) as unknown as PresentationRecord[]}
        teamId={team.id}
        userId={user.id}
      />

      <Link
        className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground"
        href={`/equipos/${team.id}`}
      >
        <Mic2 className="size-4" /> Volver a notas y evaluación
      </Link>
    </div>
  );
}


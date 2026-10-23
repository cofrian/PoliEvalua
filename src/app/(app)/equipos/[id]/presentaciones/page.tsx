import { ArrowLeft, Mic2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PresentationStudio } from "@/components/app/presentation-studio";
import { loadPresentationData, recordingDisabledReason } from "@/lib/app/presentation-data";
import { getSession } from "@/lib/app/session";

export default async function TeamPresentationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, role, isAdmin, event, recording, words } = await getSession();
  const t = await getTranslations("presentationsPage");

  const [{ data: team }, { records, juryReports }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, number, name, project_title")
      .eq("id", id)
      .eq("event_id", event.id)
      .maybeSingle(),
    loadPresentationData(supabase, event.id, id),
  ]);

  if (!team) notFound();

  return (
    <div className="space-y-6">
      <Link
        className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
        href={`/equipos/${team.id}`}
      >
        <ArrowLeft className="size-4" /> {t("back")}
      </Link>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-muted-foreground">
            {words.unit} #{team.number} · {team.name}
          </p>
          <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
            {t("title")}
          </h1>
          {team.project_title ? (
            <p className="mt-1 text-muted-foreground">{team.project_title}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">
          <ShieldCheck className="size-4 text-leaf-500" /> {t("isolated", { space: event.name })}
        </div>
      </header>

      <PresentationStudio
        canCreate={role !== "viewer" && recording.enabled}
        recordingDisabledReason={await recordingDisabledReason(recording.enabled, isAdmin)}
        canManage={isAdmin}
        initialRecords={records}
        juryReports={juryReports}
        teamId={team.id}
        userId={user.id}
      />

      <Link
        className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground"
        href={`/equipos/${team.id}`}
      >
        <Mic2 className="size-4" /> {t("backToNotes")}
      </Link>
    </div>
  );
}


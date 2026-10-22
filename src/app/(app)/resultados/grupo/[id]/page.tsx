import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PrintButton } from "@/components/app/print-button";
import { TeamFeedbackView, type TeamFeedback } from "@/components/app/team-feedback-view";
import { getSession } from "@/lib/app/session";

/** Feedback de un grupo listo para imprimir o guardar como PDF. */
export default async function TeamFeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, isAdmin, event, words } = await getSession();
  if (!isAdmin) redirect("/mi-grupo");

  const { data, error } = await supabase.rpc("team_feedback", { target_team: id });
  if (error || !data) notFound();
  const feedback = data as TeamFeedback;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link
          className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
          href="/resultados"
        >
          <ArrowLeft className="size-4" /> Resultados
        </Link>
        <PrintButton />
      </div>
      <header>
        <p className="text-sm font-bold text-muted-foreground">{event.name}</p>
        <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
          {words.unit} #{feedback.team.number} · {feedback.team.name}
        </h1>
      </header>
      <TeamFeedbackView feedback={feedback} />
    </div>
  );
}

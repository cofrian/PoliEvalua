"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";

export type PeerCriterion = {
  id: string;
  title: string;
  description: string | null;
  levels: { score: number; label: string; descriptor: string }[];
};

/**
 * Coevaluación o autoevaluación de un grupo con la rúbrica del espacio. Guarda
 * como borrador y se envía al final; se puede corregir hasta el cierre.
 */
export function PeerReviewForm({
  eventId,
  teamId,
  kind,
  criteria,
  initial,
  locked,
}: {
  eventId: string;
  teamId: string;
  kind: "peer" | "self";
  criteria: PeerCriterion[];
  initial: { scores: Record<string, number>; comment: string; status: "draft" | "submitted" } | null;
  locked: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [scores, setScores] = useState<Record<string, number>>(initial?.scores ?? {});
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [busy, setBusy] = useState(false);
  const complete = criteria.every((criterion) => typeof scores[criterion.id] === "number");

  async function save(nextStatus: "draft" | "submitted") {
    if (nextStatus === "submitted" && !complete) {
      toast.error("Puntúa todos los criterios antes de enviar.");
      return;
    }
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("peer_reviews").upsert(
      {
        event_id: eventId,
        reviewer_id: auth.user?.id,
        team_id: teamId,
        kind,
        scores,
        comment: comment.trim() || null,
        status: nextStatus,
        submitted_at: nextStatus === "submitted" ? new Date().toISOString() : null,
      },
      { onConflict: "event_id,reviewer_id,team_id,kind" },
    );
    setBusy(false);
    if (error) {
      toast.error("No se ha podido guardar. Puede que la coevaluación esté cerrada.");
      return;
    }
    setStatus(nextStatus);
    toast.success(nextStatus === "submitted" ? "Enviada. ¡Gracias!" : "Borrador guardado.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {status === "submitted" ? (
        <p className="rounded-lg border border-leaf-500/50 bg-leaf-500/10 px-3 py-2 text-sm">
          Ya la has enviado. Puedes corregirla hasta que se cierre el espacio.
        </p>
      ) : null}
      <ol className="space-y-4">
        {criteria.map((criterion) => (
          <li className="space-y-2" key={criterion.id}>
            <p className="font-semibold">{criterion.title}</p>
            {criterion.description ? <p className="text-sm text-muted-foreground">{criterion.description}</p> : null}
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={criterion.title}>
              {criterion.levels.map((level) => {
                const selected = scores[criterion.id] === level.score;
                return (
                  <button
                    aria-checked={selected}
                    className={`rounded-lg border px-3 py-2 text-left text-sm ${
                      selected ? "border-primary bg-primary/10 font-semibold" : "border-input hover:bg-muted"
                    }`}
                    disabled={locked}
                    key={level.score}
                    onClick={() => setScores((current) => ({ ...current, [criterion.id]: level.score }))}
                    role="radio"
                    title={level.descriptor}
                    type="button"
                  >
                    {level.score} · {level.label}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      <div className="space-y-1">
        <label className="text-sm font-semibold" htmlFor={`comment-${teamId}-${kind}`}>
          {kind === "self" ? "¿Qué haríais distinto?" : "Comentario para el grupo"}
        </label>
        <Textarea
          disabled={locked}
          id={`comment-${teamId}-${kind}`}
          maxLength={4000}
          onChange={(event) => setComment(event.target.value)}
          value={comment}
        />
      </div>
      {!locked ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !complete} onClick={() => void save("submitted")} type="button">
            {status === "submitted" ? "Actualizar" : "Enviar"}
          </Button>
          {status !== "submitted" ? (
            <Button disabled={busy} onClick={() => void save("draft")} type="button" variant="outline">
              Guardar borrador
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Valoración de 1 a 5 de lo que ha aportado cada compañero del grupo. */
export function ContributionForm({
  eventId,
  members,
  initial,
  locked,
}: {
  eventId: string;
  members: { id: string; name: string }[];
  initial: Record<string, number>;
  locked: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [scores, setScores] = useState<Record<string, number>>(initial);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const rows = Object.entries(scores).map(([memberId, score]) => ({
      event_id: eventId,
      reviewer_id: auth.user?.id,
      member_id: memberId,
      score,
    }));
    const { error } = await supabase.from("contribution_reviews").upsert(rows, { onConflict: "reviewer_id,member_id" });
    setBusy(false);
    if (error) {
      toast.error("No se ha podido guardar la valoración.");
      return;
    }
    toast.success("Valoración guardada.");
    router.refresh();
  }

  const labels = ["", "Casi nada", "Poco", "Lo esperado", "Mucho", "Muchísimo"];

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {members.map((member) => (
          <li className="flex flex-wrap items-center justify-between gap-2" key={member.id}>
            <span className="font-semibold">{member.name}</span>
            <span className="flex gap-1" role="radiogroup" aria-label={`Aportación de ${member.name}`}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  aria-checked={scores[member.id] === value}
                  className={`size-9 rounded-md border text-sm ${
                    scores[member.id] === value ? "border-primary bg-primary/10 font-bold" : "border-input hover:bg-muted"
                  }`}
                  disabled={locked}
                  key={value}
                  onClick={() => setScores((current) => ({ ...current, [member.id]: value }))}
                  role="radio"
                  title={labels[value]}
                  type="button"
                >
                  {value}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">1 = casi nada · 3 = lo esperado · 5 = muchísimo. Nadie del grupo verá tu valoración.</p>
      {!locked ? (
        <Button disabled={busy || !Object.keys(scores).length} onClick={() => void save()} type="button">
          Guardar valoración
        </Button>
      ) : null}
    </div>
  );
}

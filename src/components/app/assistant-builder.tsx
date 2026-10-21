"use client";

import { Bot, Check, Send, X } from "lucide-react";
import { useState } from "react";

import {
  applyAssistantProposalAction,
  rejectAssistantProposalAction,
} from "@/app/(app)/admin/evaluacion/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { EvaluationProposal } from "@/lib/ai/evaluation-proposal";
import { cardClass } from "@/lib/app/ui";

export type AssistantProposalItem = {
  id: string;
  prompt: string;
  reply: string;
  proposal: EvaluationProposal | null;
  status: "pending" | "applied" | "rejected";
  createdAt: string;
};

function ProposalPreview({ proposal }: { proposal: EvaluationProposal }) {
  return (
    <div className="mt-4 grid gap-4 rounded-xl border border-line bg-paper-50 p-4 text-sm dark:border-[#383C3D] dark:bg-ink-950">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Página propuesta
        </p>
        <h3 className="font-display text-xl">{proposal.evaluation.title}</h3>
        {proposal.evaluation.description ? (
          <p className="mt-1 text-muted-foreground">{proposal.evaluation.description}</p>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="font-bold">Rúbrica · {proposal.evaluation.rubricName}</p>
          <ul className="mt-2 space-y-1">
            {proposal.evaluation.criteria.map((criterion) => (
              <li className="flex justify-between gap-4" key={`${criterion.order}-${criterion.title}`}>
                <span>{criterion.title}</span>
                <strong>{criterion.weight}%</strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <p>
            <strong>Escala:</strong> {proposal.evaluation.scaleMin}–{proposal.evaluation.scaleMax}
          </p>
          <p><strong>Requisitos:</strong> {proposal.evaluation.requirements.length}</p>
          <p><strong>Preguntas:</strong> {proposal.evaluation.questions.length}</p>
          <p><strong>Evaluaciones mínimas:</strong> {proposal.evaluation.minEvaluations}</p>
          {proposal.academic ? (
            <p>
              <strong>Asignatura:</strong> {proposal.academic.subjectName}
              {proposal.academic.degree ? ` · ${proposal.academic.degree}` : ""}
            </p>
          ) : null}
          {proposal.jury.enabled ? (
            <p><strong>Paneles:</strong> {proposal.jury.panelNames.join(", ") || "por configurar"}</p>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Aplicar crea un nuevo borrador de página y una nueva versión activa de la rúbrica. Las evaluaciones antiguas se conservan.
      </p>
    </div>
  );
}

export function AssistantBuilder({
  configured,
  initialItems,
}: {
  configured: boolean;
  initialItems: AssistantProposalItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const prompt = message.trim();
    if (prompt.length < 3 || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const body = (await response.json()) as {
        id?: string;
        createdAt?: string;
        reply?: string;
        proposal?: EvaluationProposal | null;
        error?: string;
      };
      if (!response.ok || !body.id || !body.reply || !body.createdAt) {
        throw new Error(body.error ?? "No se ha podido obtener una propuesta.");
      }
      setItems((current) => [
        {
          id: body.id!,
          prompt,
          reply: body.reply!,
          proposal: body.proposal ?? null,
          status: body.proposal ? "pending" : "rejected",
          createdAt: body.createdAt!,
        },
        ...current,
      ]);
      setMessage("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ha ocurrido un error.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className={cardClass}>
        <div className="mb-4 flex items-start gap-3">
          <span className="rounded-full bg-primary/10 p-2"><Bot className="size-5" /></span>
          <div>
            <h2 className="font-display text-2xl">Asistente de evaluación</h2>
            <p className="text-sm text-muted-foreground">
              Describe la evaluación, la asignatura, los requisitos y cómo quieres organizar el jurado.
            </p>
          </div>
        </div>
        {!configured ? (
          <p className="mb-4 rounded-lg border border-orange-500/50 bg-orange-500/10 p-3 text-sm">
            Falta configurar <code>NVIDIA_API_KEY</code> y <code>NVIDIA_MODEL</code> en Vercel. La interfaz y la seguridad ya están preparadas.
          </p>
        ) : null}
        <Textarea
          aria-label="Petición para el asistente"
          className="min-h-32"
          maxLength={4000}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Crea una evaluación para Proyectos de IA de segundo curso del Grado en Informática. Quiero cinco criterios, escala del 1 al 5, tres paneles de jurado y requisitos de demo, memoria y repositorio."
          value={message}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">El asistente solo prepara borradores; nunca publica ni puntúa sin confirmación.</p>
          <Button disabled={pending || message.trim().length < 3 || !configured} onClick={() => void send()} type="button">
            <Send className="size-4" /> {pending ? "Preparando…" : "Preparar propuesta"}
          </Button>
        </div>
        {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl">Historial de propuestas</h2>
        {items.length ? items.map((item) => (
          <article className={cardClass} key={item.id}>
            <p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("es-ES")}</p>
            <p className="mt-2 font-semibold">Tú: {item.prompt}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{item.reply}</p>
            {item.proposal ? <ProposalPreview proposal={item.proposal} /> : null}
            {item.status === "pending" && item.proposal ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <form action={applyAssistantProposalAction}>
                  <input name="proposalId" type="hidden" value={item.id} />
                  <Button type="submit"><Check className="size-4" /> Confirmar y aplicar</Button>
                </form>
                <form action={rejectAssistantProposalAction}>
                  <input name="proposalId" type="hidden" value={item.id} />
                  <Button type="submit" variant="outline"><X className="size-4" /> Descartar</Button>
                </form>
              </div>
            ) : (
              <p className="mt-4 text-xs font-bold uppercase text-muted-foreground">
                {item.status === "applied" ? "Aplicada" : "Descartada o fuera de alcance"}
              </p>
            )}
          </article>
        )) : <p className="text-sm text-muted-foreground">Todavía no hay propuestas.</p>}
      </section>
    </div>
  );
}


"use client";

import { Bot, CalendarDays, Check, HelpCircle, MessageSquarePlus, Send, Users, X } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import {
  applyAssistantProposalAction,
  rejectAssistantProposalAction,
} from "@/app/(app)/admin/evaluacion/actions";
import { ActionForm } from "@/components/app/action-form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AssistantAction, EvaluationProposal } from "@/lib/ai/evaluation-proposal";
import { cardClass } from "@/lib/app/ui";
import { cn } from "@/lib/utils";

export type AssistantTurn = {
  id: string;
  prompt: string;
  reply: string;
  questions: string[];
  action: AssistantAction | null;
  status: "pending" | "applied" | "rejected" | "info";
  createdAt: string;
};

type Thread = { id: string; title: string; updatedAt: string };

function EvaluationPreview({ proposal }: { proposal: EvaluationProposal }) {
  const t = useTranslations("assistant.preview");
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("page")}</p>
        <h3 className="font-display text-xl">{proposal.evaluation.title}</h3>
        {proposal.evaluation.description ? (
          <p className="mt-1 text-muted-foreground">{proposal.evaluation.description}</p>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="font-bold">{t("rubric", { name: proposal.evaluation.rubricName })}</p>
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
            <strong>{t("scale")}</strong> {proposal.evaluation.scaleMin}–{proposal.evaluation.scaleMax}
          </p>
          <p><strong>{t("requirements")}</strong> {proposal.evaluation.requirements.length}</p>
          <p><strong>{t("questions")}</strong> {proposal.evaluation.questions.length}</p>
          <p><strong>{t("minEvaluations")}</strong> {proposal.evaluation.minEvaluations}</p>
          {proposal.academic ? (
            <p>
              <strong>{t("subject")}</strong> {proposal.academic.subjectName}
              {proposal.academic.degree ? ` · ${proposal.academic.degree}` : ""}
            </p>
          ) : null}
          {proposal.jury.enabled ? (
            <p><strong>{t("panels")}</strong> {proposal.jury.panelNames.join(", ") || t("panelsLater")}</p>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("evaluationNote")}</p>
    </div>
  );
}

function GroupsPreview({ action }: { action: Extract<AssistantAction, { type: "groups" }> }) {
  const t = useTranslations("assistant.preview");
  const members = action.groups.reduce((sum, group) => sum + group.members.length, 0);
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 font-bold">
        <Users aria-hidden="true" className="size-4" /> {t("groupsTitle", { groups: action.groups.length, members })}
      </p>
      <ul className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
        {action.groups.map((group) => (
          <li className="rounded-lg border border-border bg-card p-3" key={group.name}>
            <p className="font-semibold">{group.name}</p>
            {group.projectTitle ? <p className="text-xs text-muted-foreground">{group.projectTitle}</p> : null}
            <p className="mt-1 text-xs text-muted-foreground">{group.members.join(", ") || t("noMembers")}</p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t("groupsNote")}</p>
    </div>
  );
}

function AgendaPreview({ action }: { action: Extract<AssistantAction, { type: "agenda" }> }) {
  const t = useTranslations("assistant.preview");
  const format = useFormatter();
  const start = new Date(`${action.start}:00`);
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 font-bold">
        <CalendarDays aria-hidden="true" className="size-4" /> {t("agendaTitle")}
      </p>
      <p><strong>{t("rooms")}</strong> {action.rooms.join(", ")}</p>
      <p>
        <strong>{t("start")}</strong>{" "}
        {Number.isNaN(start.getTime()) ? action.start : format.dateTime(start, { dateStyle: "full", timeStyle: "short" })}
      </p>
      <p>
        <strong>{t("slots")}</strong> {t("slotsValue", { duration: action.durationMinutes, gap: action.gapMinutes })}
      </p>
      <p><strong>{t("order")}</strong> {action.order === "random" ? t("random") : t("byNumber")}</p>
      <p className="text-xs text-muted-foreground">{t("agendaNote")}</p>
    </div>
  );
}

function ActionPreview({ action }: { action: AssistantAction }) {
  return (
    <div className="mt-4 rounded-xl border border-border bg-muted p-4 text-sm dark:bg-ink-950">
      {action.type === "evaluation" ? (
        <EvaluationPreview proposal={action.proposal} />
      ) : action.type === "groups" ? (
        <GroupsPreview action={action} />
      ) : (
        <AgendaPreview action={action} />
      )}
    </div>
  );
}

/**
 * Conversación con el asistente de Admin. Cada respuesta puede preguntar lo que
 * falta o proponer una acción (evaluación, grupos o agenda) con vista previa;
 * nada se aplica hasta pulsar «Confirmar y aplicar».
 */
export function AssistantBuilder({
  configured,
  initialThreadId,
  initialTurns,
  threads,
}: {
  configured: boolean;
  initialThreadId: string | null;
  initialTurns: AssistantTurn[];
  threads: Thread[];
}) {
  const t = useTranslations("assistant");
  const format = useFormatter();
  const [threadId, setThreadId] = useState(initialThreadId);
  const [turns, setTurns] = useState(initialTurns);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length, pending]);

  async function send() {
    const prompt = message.trim();
    if (pending) return;
    if (prompt.length < 3) {
      setError(t("errors.tooShort"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, threadId }),
      });
      const body = (await response.json()) as {
        id?: string;
        threadId?: string;
        createdAt?: string;
        reply?: string;
        questions?: string[];
        action?: AssistantAction | null;
        error?: string;
      };
      if (!response.ok || !body.id || !body.reply || !body.createdAt) {
        throw new Error(body.error ?? t("errors.noAnswer"));
      }
      setThreadId(body.threadId ?? threadId);
      setTurns((current) => [
        ...current,
        {
          id: body.id!,
          prompt,
          reply: body.reply!,
          questions: body.questions ?? [],
          action: body.action ?? null,
          status: body.action ? "pending" : "info",
          createdAt: body.createdAt!,
        },
      ]);
      setMessage("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.generic"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
      <section className={cn(cardClass, "flex min-h-[28rem] flex-col")}>
        <div className="mb-4 flex items-start gap-3">
          <span className="rounded-full bg-primary/10 p-2"><Bot aria-hidden="true" className="size-5" /></span>
          <div>
            <h2 className="font-display text-xl">{t("title")}</h2>
            <p className="text-sm text-muted-foreground">{t("intro")}</p>
          </div>
        </div>
        {!configured ? (
          <p className="mb-4 rounded-lg border border-orange-500/50 bg-orange-500/10 p-3 text-sm">
            {t.rich("notConfigured", { code: (chunks) => <code>{chunks}</code> })}
          </p>
        ) : null}

        <ol aria-live="polite" className="flex-1 space-y-5">
          {turns.length === 0 ? (
            <li className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">{t("examplesTitle")}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>{t("example1")}</li>
                <li>{t("example2")}</li>
                <li>{t("example3")}</li>
              </ul>
            </li>
          ) : null}
          {turns.map((turn) => (
            <li className="space-y-3" key={turn.id}>
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary/10 px-4 py-2 text-sm">
                <p className="whitespace-pre-wrap">{turn.prompt}</p>
              </div>
              <div className="max-w-[95%] rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3 text-sm">
                <p className="whitespace-pre-wrap leading-6">{turn.reply}</p>
                {turn.questions.length ? (
                  <div className="mt-3 rounded-lg bg-upv-yellow/15 p-3">
                    <p className="flex items-center gap-2 font-semibold">
                      <HelpCircle aria-hidden="true" className="size-4" /> {t("questionsTitle")}
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {turn.questions.map((question) => <li key={question}>{question}</li>)}
                    </ul>
                  </div>
                ) : null}
                {turn.action ? <ActionPreview action={turn.action} /> : null}
                {turn.action && turn.status === "pending" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionForm action={applyAssistantProposalAction}>
                      <input name="proposalId" type="hidden" value={turn.id} />
                      <Button type="submit"><Check aria-hidden="true" className="size-4" /> {t("apply")}</Button>
                    </ActionForm>
                    <ActionForm action={rejectAssistantProposalAction}>
                      <input name="proposalId" type="hidden" value={turn.id} />
                      <Button type="submit" variant="outline"><X aria-hidden="true" className="size-4" /> {t("discard")}</Button>
                    </ActionForm>
                  </div>
                ) : turn.action ? (
                  <p className="mt-4 text-xs font-bold uppercase text-muted-foreground">
                    {turn.status === "applied" ? t("applied") : t("discarded")}
                  </p>
                ) : null}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {format.dateTime(new Date(turn.createdAt), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </li>
          ))}
          {pending ? (
            <li className="max-w-[95%] rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground" role="status">
              {t("thinking")}
            </li>
          ) : null}
        </ol>
        <div ref={endRef} />

        <form
          className="mt-5 border-t border-border pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <Textarea
            aria-label={t("inputLabel")}
            className="min-h-24"
            maxLength={4000}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void send();
            }}
            placeholder={turns.length ? t("replyPlaceholder") : t("placeholder")}
            value={message}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{t("safety")}</p>
            <Button disabled={pending || !configured} type="submit">
              <Send aria-hidden="true" className="size-4" /> {pending ? t("sending") : t("send")}
            </Button>
          </div>
          {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
        </form>
      </section>

      <aside className="space-y-3">
        <Button asChild className="w-full" variant="outline">
          <Link href="/admin/asistente?nuevo=1">
            <MessageSquarePlus aria-hidden="true" className="size-4" /> {t("newThread")}
          </Link>
        </Button>
        {threads.length ? (
          <nav aria-label={t("threads")} className="space-y-1">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("threads")}</p>
            {threads.map((thread) => (
              <Link
                aria-current={thread.id === threadId ? "page" : undefined}
                className={cn(
                  "block truncate rounded-lg px-3 py-2 text-sm hover:bg-muted",
                  thread.id === threadId && "bg-muted font-semibold",
                )}
                href={`/admin/asistente?hilo=${thread.id}`}
                key={thread.id}
                title={thread.title}
              >
                {thread.title}
              </Link>
            ))}
          </nav>
        ) : null}
      </aside>
    </div>
  );
}

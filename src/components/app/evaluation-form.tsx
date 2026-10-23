"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "@/lib/app/ui";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type Criterion = {
  id: string;
  title: string;
  description: string | null;
  weight: number;
  rubric_levels: { score: number; label: string; descriptor: string | null; example?: string | null }[];
};

type ScoreState = Record<string, { score: number | null; comment: string }>;

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

export type EvaluationPageConfig = {
  title: string;
  description: string | null;
  instructions: string | null;
  requirements: {
    key: string;
    label: string;
    description: string | null;
    required: boolean;
  }[];
  questions: {
    key: string;
    label: string;
    description: string | null;
    type: "text" | "textarea" | "boolean" | "select";
    required: boolean;
    options: string[];
  }[];
};

export function EvaluationForm({
  criteria,
  eventId,
  initial,
  locked,
  page,
  rubricId,
  scaleMax,
  teamId,
  userId,
  canShareWithTeam = false,
}: {
  criteria: Criterion[];
  eventId: string;
  initial: {
    id: string;
    status: string;
    generalComment: string;
    shareWithTeam?: boolean;
    formAnswers: Record<string, string | boolean>;
    scores: { criterion_id: string; score: number | null; comment: string | null }[];
  } | null;
  /** Solo en espacios con alumnado tiene sentido compartir comentarios con el grupo. */
  canShareWithTeam?: boolean;
  locked: boolean;
  page: EvaluationPageConfig | null;
  rubricId: string;
  scaleMax: number;
  teamId: string;
  userId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const t = useTranslations("evalForm");
  const evaluationId = useRef<string | null>(initial?.id ?? null);
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [generalComment, setGeneralComment] = useState(
    initial?.generalComment ?? "",
  );
  const [shareWithTeam, setShareWithTeam] = useState(initial?.shareWithTeam ?? false);
  const [formAnswers, setFormAnswers] = useState<Record<string, string | boolean>>(
    initial?.formAnswers ?? {},
  );
  const [scores, setScores] = useState<ScoreState>(() =>
    Object.fromEntries(
      criteria.map((criterion) => {
        const existing = initial?.scores.find(
          (s) => s.criterion_id === criterion.id,
        );
        return [
          criterion.id,
          { score: existing?.score ?? null, comment: existing?.comment ?? "" },
        ];
      }),
    ),
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [dirty, setDirty] = useState(false);

  const total = criteria.reduce((sum, criterion) => {
    const score = scores[criterion.id]?.score;
    return score ? sum + (score / scaleMax) * criterion.weight : sum;
  }, 0);
  const scoredCount = criteria.filter((c) => scores[c.id]?.score).length;
  const requiredAnswersComplete = !page || Boolean(
    page.requirements.every(
      (requirement) =>
        !requirement.required ||
        formAnswers[`requirement:${requirement.key}`] === true,
    ) &&
      page.questions.every((question) => {
        if (!question.required) return true;
        const answer = formAnswers[`question:${question.key}`];
        return typeof answer === "boolean" ? answer : Boolean(answer?.trim());
      }),
  );
  const complete = scoredCount === criteria.length && requiredAnswersComplete;

  const save = useCallback(
    async (nextStatus?: "draft" | "submitted") => {
      setSaveState("saving");

      const payload = {
        event_id: eventId,
        team_id: teamId,
        judge_id: userId,
        rubric_id: rubricId,
        general_comment: generalComment.trim() || null,
        share_with_team: shareWithTeam,
        form_answers: formAnswers,
        ...(nextStatus
          ? {
              status: nextStatus,
              submitted_at:
                nextStatus === "submitted" ? new Date().toISOString() : null,
            }
          : {}),
      };

      const { data: evaluation, error } = await supabase
        .from("evaluations")
        .upsert(payload, { onConflict: "team_id,judge_id,rubric_id" })
        .select("id, status")
        .single();

      if (error || !evaluation) {
        setSaveState("error");
        return false;
      }

      evaluationId.current = evaluation.id;

      const rows = Object.entries(scores)
        .filter(([, value]) => value.score || value.comment.trim())
        .map(([criterionId, value]) => ({
          event_id: eventId,
          evaluation_id: evaluation.id,
          criterion_id: criterionId,
          score: value.score,
          comment: value.comment.trim() || null,
        }));

      if (rows.length) {
        const { error: scoresError } = await supabase
          .from("evaluation_scores")
          .upsert(rows, { onConflict: "evaluation_id,criterion_id" });

        if (scoresError) {
          setSaveState("error");
          return false;
        }
      }

      setStatus(evaluation.status);
      setSaveState("saved");
      setDirty(false);
      return true;
    },
    [supabase, eventId, teamId, userId, rubricId, generalComment, shareWithTeam, formAnswers, scores],
  );

  // Copia local del borrador: si se va la red o se cierra la pestaña antes de
  // guardar, se recupera al volver. Se borra en cuanto el servidor confirma.
  const draftKey = `evaluation-draft:${userId}:${teamId}:${rubricId}`;
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || locked) return;
    restoredRef.current = true;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        scores: ScoreState;
        generalComment: string;
        formAnswers: Record<string, string | boolean>;
      };
      setScores((current) => ({ ...current, ...draft.scores }));
      setGeneralComment(draft.generalComment);
      setFormAnswers(draft.formAnswers);
      setDirty(true);
      toast.info(t("restored"));
    } catch {
      // Sin almacenamiento local (modo privado): solo autoguardado en servidor.
    }
  }, [draftKey, locked, t]);

  useEffect(() => {
    if (!dirty || locked) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify({ scores, generalComment, formAnswers }));
    } catch {
      // Ignorado: el autoguardado en servidor sigue funcionando.
    }
  }, [dirty, locked, draftKey, scores, generalComment, formAnswers]);

  useEffect(() => {
    if (saveState !== "saved" || dirty) return;
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // Ignorado.
    }
  }, [saveState, dirty, draftKey]);

  // Autoguardado: 800 ms después del último cambio.
  useEffect(() => {
    if (!dirty || locked) return;
    setSaveState("pending");
    const timer = setTimeout(() => void save(), 800);
    return () => clearTimeout(timer);
  }, [dirty, locked, save]);

  // Sin conexión el guardado falla: se reintenta al volver la red.
  useEffect(() => {
    if (saveState !== "error" || locked) return;
    const retry = () => void save();
    window.addEventListener("online", retry);
    const timer = setInterval(retry, 15_000);
    return () => {
      window.removeEventListener("online", retry);
      clearInterval(timer);
    };
  }, [saveState, locked, save]);

  function update(criterionId: string, patch: Partial<ScoreState[string]>) {
    setScores((current) => ({
      ...current,
      [criterionId]: { ...current[criterionId], ...patch },
    }));
    setDirty(true);
  }

  function updateAnswer(key: string, answer: string | boolean) {
    setFormAnswers((current) => ({ ...current, [key]: answer }));
    setDirty(true);
  }

  async function submit() {
    if (!complete) {
      toast.error(t("incomplete"));
      return;
    }
    const ok = await save("submitted");
    if (ok) {
      toast.success(t("sent"));
      router.push("/equipos");
      router.refresh();
    } else {
      toast.error(t("sendError"));
    }
  }

  const saveLabel = saveState === "idle" ? "" : t(`save.${saveState}`);

  return (
    <div className="space-y-6">
      {locked ? (
        <p className="rounded-lg border border-coral-400/50 bg-coral-400/10 px-3 py-2.5 text-sm">
          {t("locked")}
        </p>
      ) : status === "submitted" && !complete ? (
        <p className="rounded-lg border border-orange-500/60 bg-orange-500/10 px-3 py-2.5 text-sm">
          {t("rubricChanged")}
        </p>
      ) : status === "submitted" ? (
        <p className="rounded-lg border border-leaf-500/50 bg-leaf-500/10 px-3 py-2.5 text-sm">
          {t("alreadySent")}
        </p>
      ) : null}

      {page ? (
        <section className="space-y-5 rounded-xl border border-border bg-white p-4 dark:bg-card">
          <div>
            <h2 className="font-display text-xl">{page.title}</h2>
            {page.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{page.description}</p>
            ) : null}
            {page.instructions ? (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{page.instructions}</p>
            ) : null}
          </div>

          {page.requirements.length ? (
            <fieldset className="space-y-2">
              <legend className="font-display text-lg">{t("requirements")}</legend>
              {page.requirements.map((requirement) => (
                <label
                  className="flex gap-3 rounded-lg border border-border p-3 text-sm"
                  key={requirement.key}
                >
                  <input
                    checked={formAnswers[`requirement:${requirement.key}`] === true}
                    disabled={locked}
                    onChange={(event) =>
                      updateAnswer(`requirement:${requirement.key}`, event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>
                    <strong className="block">
                      {requirement.label}{requirement.required ? " *" : ""}
                    </strong>
                    {requirement.description ? (
                      <span className="text-muted-foreground">{requirement.description}</span>
                    ) : null}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}

          {page.questions.length ? (
            <fieldset className="space-y-4">
              <legend className="font-display text-lg">{t("questions")}</legend>
              {page.questions.map((question) => {
                const key = `question:${question.key}`;
                const answer = formAnswers[key];
                return (
                  <label className="block space-y-1 text-sm font-semibold" key={question.key}>
                    <span className="block">
                      {question.label}{question.required ? " *" : ""}
                    </span>
                    {question.description ? (
                      <span className="block font-normal text-muted-foreground">
                        {question.description}
                      </span>
                    ) : null}
                    {question.type === "textarea" ? (
                      <Textarea
                        disabled={locked}
                        onChange={(event) => updateAnswer(key, event.target.value)}
                        value={typeof answer === "string" ? answer : ""}
                      />
                    ) : question.type === "boolean" ? (
                      <span className="flex items-center gap-2 font-normal">
                        <input
                          checked={answer === true}
                          disabled={locked}
                          onChange={(event) => updateAnswer(key, event.target.checked)}
                          type="checkbox"
                        />
                        {t("yes")}
                      </span>
                    ) : question.type === "select" ? (
                      <select
                        className={`${selectClass} w-full`}
                        disabled={locked}
                        onChange={(event) => updateAnswer(key, event.target.value)}
                        value={typeof answer === "string" ? answer : ""}
                      >
                        <option value="">{t("chooseOption")}</option>
                        {question.options.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        disabled={locked}
                        onChange={(event) => updateAnswer(key, event.target.value)}
                        value={typeof answer === "string" ? answer : ""}
                      />
                    )}
                  </label>
                );
              })}
            </fieldset>
          ) : null}
        </section>
      ) : null}

      <ol className="space-y-5">
        {criteria.map((criterion, index) => {
          const current = scores[criterion.id];
          const selected = criterion.rubric_levels.find(
            (level) => level.score === current?.score,
          );
          return (
            <li
              className="rounded-xl border border-border bg-white p-4 dark:bg-card"
              key={criterion.id}
            >
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-lg leading-snug">
                  {index + 1}. {criterion.title}
                </h2>
                <span className="shrink-0 text-sm font-bold text-muted-foreground">
                  {criterion.weight} %
                </span>
              </div>
              <div
                aria-label={criterion.title}
                className="grid grid-cols-5 gap-2"
                role="radiogroup"
              >
                {criterion.rubric_levels.map((level) => (
                  <button
                    aria-checked={current?.score === level.score}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center rounded-lg border px-1 py-2 text-center transition-colors disabled:opacity-60",
                      current?.score === level.score
                        ? "border-navy-900 bg-navy-900 text-white dark:border-orange-100 dark:bg-orange-100 dark:text-navy-900"
                        : "border-border hover:bg-navy-900/5 dark:hover:bg-white/10",
                    )}
                    disabled={locked}
                    key={level.score}
                    onClick={() =>
                      update(criterion.id, {
                        score:
                          current?.score === level.score ? null : level.score,
                      })
                    }
                    role="radio"
                    title={level.descriptor ?? level.label}
                    type="button"
                  >
                    <span className="text-lg font-bold">{level.score}</span>
                    <span className="hidden text-[11px] leading-tight sm:block">
                      {level.label}
                    </span>
                  </button>
                ))}
              </div>
              {selected?.descriptor ? (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  <strong className="text-foreground">{selected.label}:</strong>{" "}
                  {selected.descriptor}
                  {selected.example ? (
                    <span className="mt-1 block text-xs italic">{t("example", { example: selected.example })}</span>
                  ) : null}
                </p>
              ) : null}
              <Textarea
                aria-label={t("commentOn", { criterion: criterion.title })}
                className="mt-3 min-h-16"
                disabled={locked}
                onChange={(event) =>
                  update(criterion.id, { comment: event.target.value })
                }
                placeholder={t("commentPlaceholder")}
                value={current?.comment ?? ""}
              />
            </li>
          );
        })}
      </ol>

      <div className="space-y-2">
        <label className="text-sm font-semibold" htmlFor="generalComment">
          {t("generalComment")}
        </label>
        <Textarea
          disabled={locked}
          id="generalComment"
          onChange={(event) => {
            setGeneralComment(event.target.value);
            setDirty(true);
          }}
          value={generalComment}
        />
        {canShareWithTeam ? (
          <label className="flex items-start gap-2 text-sm">
            <input
              checked={shareWithTeam}
              className="mt-1"
              disabled={locked}
              onChange={(event) => {
                setShareWithTeam(event.target.checked);
                setDirty(true);
              }}
              type="checkbox"
            />
            <span>
              {t("shareWithTeam")}
              <span className="block text-xs text-muted-foreground">
                {t("shareHint")}
              </span>
            </span>
          </label>
        ) : null}
      </div>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-0 -mx-4 flex items-center justify-between gap-4 border-t border-border bg-muted/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border dark:bg-ink-950/95">
        <div>
          <p className="font-display text-3xl leading-none">
            {total.toFixed(1)}
            <span className="text-base text-muted-foreground"> / 100</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
            {t("progress", { scored: scoredCount, total: criteria.length })} · {requiredAnswersComplete ? t("requirementsDone") : t("requirementsMissing")}
            {saveLabel ? ` · ${saveLabel}` : ""}
          </p>
        </div>
        {!locked ? (
          <Button
            className="h-11 px-5 font-bold"
            disabled={saveState === "saving"}
            onClick={() => void submit()}
            type="button"
          >
            {status === "submitted" ? t("resend") : t("send")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

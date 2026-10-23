import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { JuryWeaknesses } from "@/components/app/jury-weaknesses";
import type { CriterionEvidence, JuryWeakness } from "@/lib/ai/presentation-insights";

export type AiEvidence = {
  recordingTitle: string;
  criteria: CriterionEvidence[];
  questions: string[];
  risks: string[];
  weaknesses: JuryWeakness[];
} | null;

const coverageStyles: Record<CriterionEvidence["coverage"], string> = {
  clear: "bg-leaf-500/15 text-leaf-500",
  partial: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  absent: "bg-muted text-muted-foreground",
};

/**
 * Lo que dijo el grupo, ordenado por criterio, para tenerlo a mano mientras
 * se puntúa. Son citas literales verificadas; la IA nunca propone notas.
 */
export function AiEvidencePanel({
  evidence,
  processing,
  teamId,
}: {
  evidence: AiEvidence;
  processing: boolean;
  teamId: string;
}) {
  const t = useTranslations("aiEvidence");
  return (
    <div className="space-y-4 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <Sparkles aria-hidden="true" className="size-4 text-primary" /> {t("title")}
      </p>
      {!evidence ? (
        <p className="text-muted-foreground">
          {processing
            ? t("processing")
            : t("none")}{" "}
          <Link className="font-semibold underline" href={`/equipos/${teamId}/presentaciones`}>
            {t("viewPresentations")}
          </Link>
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {t("basedOn", { title: evidence.recordingTitle })}
          </p>
          {evidence.criteria.map((item) => (
            <details className="rounded-lg border border-border p-3" key={item.criterion}>
              <summary className="flex cursor-pointer items-center justify-between gap-2 font-semibold">
                <span>{item.criterion}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${coverageStyles[item.coverage]}`}>
                  {t(`coverage.${item.coverage}`)}
                </span>
              </summary>
              {item.evidence.length ? (
                <ul className="mt-2 space-y-2">
                  {item.evidence.map((entry) => (
                    <li key={entry.quote}>
                      <blockquote className="border-l-2 border-primary/50 pl-2 italic">«{entry.quote}»</blockquote>
                      <p className="mt-1 text-xs text-muted-foreground">{entry.explanation}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-muted-foreground">{t("noMention")}</p>
              )}
            </details>
          ))}
          <JuryWeaknesses compact weaknesses={evidence.weaknesses} />
          {evidence.questions.length ? (
            <div>
              <p className="mb-1 font-semibold">{t("questions")}</p>
              <ul className="list-disc space-y-1 pl-5">
                {evidence.questions.map((question) => <li key={question}>{question}</li>)}
              </ul>
            </div>
          ) : null}
          {evidence.risks.length ? (
            <div>
              <p className="mb-1 font-semibold">{t("risks")}</p>
              <ul className="list-disc space-y-1 pl-5">
                {evidence.risks.map((risk) => <li key={risk}>{risk}</li>)}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

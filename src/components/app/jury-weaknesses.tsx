import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import type { JuryWeakness } from "@/lib/ai/presentation-insights";

/**
 * Puntos débiles de la exposición agrupados por criterio de la rúbrica, con
 * la cita que lo muestra (verificada) y una pregunta para comprobarlo.
 */
export function JuryWeaknesses({
  weaknesses,
  compact = false,
}: {
  weaknesses: JuryWeakness[];
  compact?: boolean;
}) {
  const t = useTranslations("weaknesses");
  if (!weaknesses.length) return null;
  const groups = new Map<string, JuryWeakness[]>();
  for (const item of weaknesses) {
    groups.set(item.criterion, [...(groups.get(item.criterion) ?? []), item]);
  }

  return (
    <div>
      <p className={compact ? "mb-1 font-semibold" : "mb-2 font-bold"}>
        {t("title")}
      </p>
      <div className="space-y-2">
        {[...groups].map(([criterion, items]) => (
          <details
            className="rounded-lg border border-orange-500/30 bg-card p-3"
            key={criterion}
            open={!compact}
          >
            <summary className="flex cursor-pointer items-center justify-between gap-2 font-semibold">
              <span>{criterion}</span>
              <span className="shrink-0 rounded-full bg-orange-500/15 px-2 py-0.5 text-xs text-orange-600 dark:text-orange-400">
                {t("count", { count: items.length })}
              </span>
            </summary>
            <ul className="mt-2 space-y-3 text-sm">
              {items.map((item, index) => (
                <li key={`${item.weakness}-${index}`}>
                  <p className="flex gap-2">
                    <TriangleAlert
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-orange-500"
                    />
                    {item.weakness}
                  </p>
                  {item.quote ? (
                    <blockquote className="ml-6 mt-1 border-l-2 border-orange-500/50 pl-2 italic">
                      «{item.quote}»
                    </blockquote>
                  ) : (
                    <p className="ml-6 mt-1 text-xs text-muted-foreground">{t("notCovered")}</p>
                  )}
                  <p className="ml-6 mt-1 text-xs">
                    <span className="font-semibold">{t("question")}</span> {item.question}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  );
}

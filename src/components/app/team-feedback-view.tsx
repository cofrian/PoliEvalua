export type TeamFeedback = {
  team: { id: string; name: string; number: number | null };
  scaleMax: number;
  evaluations: number;
  criteria: {
    title: string;
    description: string | null;
    weight: number;
    average: number | null;
    comments: string[];
  }[];
  generalComments: string[];
  presentation: {
    summary: string | null;
    key_points: string[] | null;
    outline: { heading: string; bullets: string[] }[] | null;
  } | null;
};

export type PeerSummary = {
  peer: { count: number; criteria: Record<string, number> };
  self: { count: number; criteria: Record<string, number> };
  contribution: { memberId: string; name: string; average: number | null; count: number }[];
  peerComments: string[];
};

/** Lo que opinan otros grupos (medias y comentarios anónimos) y tu aportación. */
export function PeerSummaryView({
  summary,
  criteria,
  scaleMax,
}: {
  summary: PeerSummary;
  criteria: { id: string; title: string }[];
  scaleMax: number;
}) {
  const own = summary.contribution[0];
  return (
    <div className="space-y-4 text-sm">
      {summary.peer.count ? (
        <div>
          <p className="mb-2 font-semibold">
            Media de {summary.peer.count} {summary.peer.count === 1 ? "revisión" : "revisiones"} de compañeros
            {summary.self.count ? " y vuestra autoevaluación" : ""}
          </p>
          <ul className="space-y-1">
            {criteria.map((criterion) => (
              <li className="flex justify-between gap-3" key={criterion.id}>
                <span>{criterion.title}</span>
                <span className="font-mono">
                  {summary.peer.criteria[criterion.id] ?? "–"}
                  {summary.self.count ? ` · auto ${summary.self.criteria[criterion.id] ?? "–"}` : ""} / {scaleMax}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-muted-foreground">Todavía no hay coevaluaciones de otros grupos.</p>
      )}
      {summary.peerComments.length ? (
        <div>
          <p className="mb-1 font-semibold">Comentarios de compañeros</p>
          <ul className="space-y-1">
            {summary.peerComments.map((comment, index) => (
              <li className="rounded-lg bg-muted p-2 italic" key={index}>«{comment}»</li>
            ))}
          </ul>
        </div>
      ) : null}
      {own?.count ? (
        <p>
          Tus compañeros valoran tu aportación con un <strong>{own.average}</strong> sobre 5 ({own.count}{" "}
          {own.count === 1 ? "valoración" : "valoraciones"}).
        </p>
      ) : null}
    </div>
  );
}

/** Nota final sobre 10 a partir de las medias por criterio y sus pesos. */
export function feedbackGrade(feedback: TeamFeedback) {
  if (!feedback.evaluations) return null;
  const total = feedback.criteria.reduce(
    (sum, criterion) => sum + ((criterion.average ?? 0) / feedback.scaleMax) * criterion.weight,
    0,
  );
  return Math.round(total) / 10;
}

/**
 * Feedback de un grupo: nota, medias por criterio, comentarios compartidos (sin
 * nombres) y resumen de su exposición. Se imprime bien como PDF.
 */
export function TeamFeedbackView({ feedback }: { feedback: TeamFeedback }) {
  const grade = feedbackGrade(feedback);

  if (!feedback.evaluations) {
    return <p className="text-sm text-muted-foreground">Todavía no hay evaluaciones enviadas.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <p className="text-sm text-muted-foreground">Nota</p>
          <p className="font-display text-5xl leading-none">
            {grade?.toFixed(1)}
            <span className="text-xl text-muted-foreground"> / 10</span>
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Media de {feedback.evaluations} evaluación{feedback.evaluations === 1 ? "" : "es"}.
        </p>
      </div>

      <ol className="space-y-3">
        {feedback.criteria.map((criterion) => {
          const percent = criterion.average === null ? 0 : (criterion.average / feedback.scaleMax) * 100;
          return (
            <li className="break-inside-avoid rounded-lg border border-line p-4 dark:border-[#262838]" key={criterion.title}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">
                  {criterion.title} <span className="font-normal text-muted-foreground">· {criterion.weight} %</span>
                </p>
                <p className="font-mono font-semibold">
                  {criterion.average ?? "–"} / {feedback.scaleMax}
                </p>
              </div>
              <div
                aria-hidden="true"
                className="mt-2 h-2 overflow-hidden rounded-full bg-muted print:border print:border-line"
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
              </div>
              {criterion.comments.length ? (
                <ul className="mt-3 space-y-1 text-sm">
                  {criterion.comments.map((comment, index) => (
                    <li className="border-l-2 border-primary/40 pl-2" key={index}>{comment}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>

      {feedback.generalComments.length ? (
        <section className="break-inside-avoid">
          <h3 className="mb-2 font-display text-xl">Comentarios generales</h3>
          <ul className="space-y-2 text-sm">
            {feedback.generalComments.map((comment, index) => (
              <li className="rounded-lg bg-muted p-3 italic" key={index}>«{comment}»</li>
            ))}
          </ul>
        </section>
      ) : null}

      {feedback.presentation?.summary ? (
        <section className="break-inside-avoid space-y-2">
          <h3 className="font-display text-xl">Resumen de vuestra exposición</h3>
          <p className="whitespace-pre-line text-sm leading-6">{feedback.presentation.summary}</p>
          {feedback.presentation.key_points?.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {feedback.presentation.key_points.map((point) => <li key={point}>{point}</li>)}
            </ul>
          ) : null}
          <p className="text-xs text-muted-foreground">Generado automáticamente a partir de la transcripción; no influye en la nota.</p>
        </section>
      ) : null}
    </div>
  );
}

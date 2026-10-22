import type { ReactNode } from "react";

/** Estado vacío con explicación y, si procede, la acción que lo resuelve. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
      {icon ? (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-upv-yellow/25 text-foreground [&_svg]:size-6">
          {icon}
        </div>
      ) : null}
      <p className="font-display text-lg">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

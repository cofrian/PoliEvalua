import Link from "next/link";

import { cn } from "@/lib/utils";

/** Logo de GitHub (lucide ya no incluye marcas). */
export function Github({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className ?? "size-4"} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.82 1.19 3.08 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

export const REPO_URL = "https://github.com/cofrian/valencia-hack-jurado";

/** Sugerencias y errores: se abren como incidencias públicas en GitHub. */
export const FEEDBACK_URL = `${REPO_URL}/issues/new/choose`;

type PoliBrandProps = {
  className?: string;
  href?: string;
  /** Versión estrecha para la barra lateral y la cabecera del móvil. */
  compact?: boolean;
};

/** Corchete dibujado (no texto): amarillo UPV sin depender del contraste del texto. */
function Bracket({ side }: { side: "left" | "right" }) {
  return (
    <svg aria-hidden="true" className="h-[1.15em] w-[0.38em] shrink-0 text-upv-yellow" viewBox="0 0 10 28">
      <path
        d={side === "left" ? "M9 2H3v24h6" : "M1 2h6v24H1"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeWidth="3.2"
      />
    </svg>
  );
}

/** Marca de PoliEvalúa, al estilo de la familia Poli[…] de la UPV. */
export function PoliWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center font-heading font-bold tracking-tight", className)}>
      <span>Poli</span>
      <Bracket side="left" />
      <span className="font-semibold">Evalúa</span>
      <Bracket side="right" />
    </span>
  );
}

export function PoliBrand({ className, href = "/", compact = false }: PoliBrandProps) {
  return (
    <Link
      aria-label="PoliEvalúa"
      className={cn("inline-flex min-w-0 items-center text-upv-ink dark:text-white", className)}
      href={href}
    >
      <PoliWordmark className={compact ? "text-xl" : "text-2xl sm:text-[1.7rem]"} />
    </Link>
  );
}

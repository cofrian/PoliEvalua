import Link from "next/link";

import { cn } from "@/lib/utils";

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

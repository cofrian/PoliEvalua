import type { ReactNode } from "react";

/** Texto blanco o oscuro según lo claro que sea el color de fondo. */
function readableOn(hex: string) {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? "#1f2323" : "#ffffff";
}

/**
 * Portada del espacio: su nombre con el logo y el color que elige la gestión.
 * Sin color propio se usa el gris oscuro de la UPV con la franja amarilla.
 */
export function SpaceCover({
  name,
  eyebrow,
  subtitle,
  logoUrl,
  color,
  children,
}: {
  name: string;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  logoUrl: string | null;
  color: string | null;
  /** Acciones o datos a la derecha. */
  children?: ReactNode;
}) {
  const background = color ?? "#3f4444";
  const foreground = readableOn(background);
  return (
    <section
      className="relative overflow-hidden rounded-2xl p-5 shadow-sm sm:p-7"
      style={{ background, color: foreground }}
    >
      {/* Diagonales con los colores de la UPV, como en la portada de la web. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 opacity-90 sm:block">
        <div className="absolute inset-y-0 right-0 w-2/3 bg-upv-yellow [clip-path:polygon(40%_0,100%_0,100%_100%,0_100%)]" />
        <div className="absolute inset-y-0 right-[30%] w-1/3 bg-upv-blue [clip-path:polygon(45%_0,100%_0,55%_100%,0_100%)]" />
      </div>
      <div className="relative flex flex-wrap items-center gap-4 sm:max-w-[70%]">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="size-14 shrink-0 rounded-xl bg-white object-contain p-1.5 shadow-sm" src={logoUrl} />
        ) : null}
        <div className="min-w-0">
          {eyebrow ? <p className="text-xs font-semibold tracking-[0.14em] uppercase opacity-80">{eyebrow}</p> : null}
          <h1 className="font-display text-2xl leading-tight tracking-tight text-balance sm:text-3xl">{name}</h1>
          {subtitle ? <p className="mt-1 text-sm opacity-85">{subtitle}</p> : null}
        </div>
      </div>
      {children ? <div className="relative mt-4 flex flex-wrap gap-2">{children}</div> : null}
    </section>
  );
}

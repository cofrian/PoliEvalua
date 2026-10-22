import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto de las páginas de gestión: cabecera y bloques de ajustes. */
export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="space-y-6" role="status">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {[4, 3].map((rows, block) => (
        <div className="space-y-px overflow-hidden rounded-2xl border border-border/70" key={block}>
          <Skeleton className="h-16 rounded-none" />
          {Array.from({ length: rows }, (_, index) => (
            <Skeleton className="h-14 rounded-none opacity-60" key={index} />
          ))}
        </div>
      ))}
    </div>
  );
}

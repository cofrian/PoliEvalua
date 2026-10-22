import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto mientras carga cualquier página: cabecera y unas tarjetas. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="space-y-6" role="status">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton className="h-32 rounded-2xl" key={index} />
        ))}
      </div>
    </div>
  );
}

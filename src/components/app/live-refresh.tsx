"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

// Recarga la página (agrupando cambios seguidos) cuando cambia cualquier
// evaluación o puntuación. Solo el admin recibe los cambios de todos (RLS).
export function LiveRefresh({ eventId }: { eventId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        router.refresh();
        setLastUpdate(new Date());
      }, 600);
    };

    const channel = supabase
      .channel(`live-votes-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "evaluations", filter: `event_id=eq.${eventId}` }, refresh)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "evaluation_scores", filter: `event_id=eq.${eventId}` },
        refresh,
      )
      .subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [supabase, router, eventId]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-leaf-500">
      <span className="size-2 animate-pulse rounded-full bg-leaf-500" aria-hidden="true" />
      En directo
      {lastUpdate ? (
        <span className="font-normal text-muted-foreground">
          · actualizado {lastUpdate.toLocaleTimeString("es-ES")}
        </span>
      ) : null}
    </span>
  );
}

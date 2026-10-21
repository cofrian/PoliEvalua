"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

/** Refresca la página cuando cambia algún turno y cada minuto (horas previstas). */
export function AgendaLiveRefresh({ eventId }: { eventId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        router.refresh();
      }, 500);
    };
    const channel = supabase
      .channel(`agenda:${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "presentation_slots", filter: `event_id=eq.${eventId}` },
        refresh,
      )
      .subscribe();
    const minute = setInterval(refresh, 60_000);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(minute);
      void supabase.removeChannel(channel);
    };
  }, [eventId, router, supabase]);

  return null;
}

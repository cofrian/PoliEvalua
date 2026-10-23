"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

// Avisa cuando otra persona cambia la rúbrica y recarga los datos.
export function RubricLiveUpdates({
  rubricId,
  userId,
}: {
  rubricId: string;
  userId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const t = useTranslations("common");

  useEffect(() => {
    const channel = supabase
      .channel(`rubric-${rubricId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "rubric_changes",
          filter: `rubric_id=eq.${rubricId}`,
        },
        async (payload) => {
          const change = payload.new as { user_id: string; summary: string };
          if (change.user_id === userId) return;
          const { data: author } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", change.user_id)
            .maybeSingle();
          toast.info(`${author?.full_name ?? t("someone")} ${change.summary}`);
          router.refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rubrics",
          filter: `id=eq.${rubricId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, rubricId, userId, router, t]);

  return null;
}

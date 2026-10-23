"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Viewer = { id: string; name: string; avatar: string | null };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

// Muestra quién más está viendo esta misma pantalla ahora mismo.
export function Presence({
  room,
  me,
}: {
  room: string;
  me: Viewer;
}) {
  const supabase = useMemo(() => createClient(), []);
  const t = useTranslations("common");
  const [viewers, setViewers] = useState<Viewer[]>([]);

  const { id, name, avatar } = me;

  useEffect(() => {
    const self: Viewer = { id, name, avatar };
    const channel = supabase.channel(`presence-${room}`, {
      config: { presence: { key: id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<Viewer>();
        const others = Object.entries(state)
          .filter(([key]) => key !== id)
          .map(([, entries]) => entries[0])
          .filter(Boolean);
        setViewers(others);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track(self);
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, room, id, name, avatar]);

  if (!viewers.length) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="flex -space-x-2">
        {viewers.slice(0, 5).map((viewer) =>
          viewer.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={viewer.name}
              className="size-7 rounded-full border-2 border-paper-50 object-cover dark:border-ink-950"
              key={viewer.id}
              src={viewer.avatar}
              title={viewer.name}
            />
          ) : (
            <span
              className="flex size-7 items-center justify-center rounded-full border-2 border-paper-50 bg-sky-400 text-[10px] font-bold text-white dark:border-ink-950"
              key={viewer.id}
              title={viewer.name}
            >
              {initials(viewer.name)}
            </span>
          ),
        )}
      </div>
      <span>
        {viewers.length === 1
          ? t("alsoHere", { name: viewers[0].name })
          : t("othersHere", { count: viewers.length })}
      </span>
    </div>
  );
}

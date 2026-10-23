"use client";

import { Lock, Trash2, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type Note = {
  id: string;
  body: string;
  is_shared: boolean;
  created_at: string;
  author_id: string | null;
  author: { full_name: string } | null;
};

const NOTE_SELECT =
  "id, body, is_shared, created_at, author_id, author:profiles(full_name)";

type PendingNote = {
  tempId: string;
  event_id: string;
  team_id: string;
  author_id: string;
  body: string;
  is_shared: boolean;
  created_at: string;
};

const QUEUE_KEY = "vh-pending-notes";

// Cola local para cuando no hay cobertura: se envía al reconectar.
function readQueue(): PendingNote[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as PendingNote[];
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingNote[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Sin almacenamiento local no hay cola; la nota se queda en el formulario.
  }
}

export function NotesPanel({
  eventId,
  teamId,
  userId,
  initialNotes,
}: {
  eventId: string;
  teamId: string;
  userId: string;
  initialNotes: Note[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const t = useTranslations("notes");
  const format = useFormatter();
  const [notes, setNotes] = useState(initialNotes);
  const [body, setBody] = useState("");
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "mine" | "shared">("all");
  const [pending, setPending] = useState<PendingNote[]>([]);

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("notes")
      .select(NOTE_SELECT)
      .eq("event_id", eventId)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });
    if (data) setNotes(data as unknown as Note[]);
  }, [supabase, eventId, teamId]);

  const flushQueue = useCallback(async () => {
    const queue = readQueue();
    if (!queue.length || !navigator.onLine) {
      setPending(queue.filter((n) => n.event_id === eventId && n.team_id === teamId));
      return;
    }
    const remaining: PendingNote[] = [];
    for (const note of queue) {
      if (note.event_id !== eventId) {
        remaining.push(note);
        continue;
      }
      const { error } = await supabase.from("notes").insert({
        event_id: note.event_id,
        team_id: note.team_id,
        author_id: note.author_id,
        body: note.body,
        is_shared: note.is_shared,
        created_at: note.created_at,
      });
      if (error) remaining.push(note);
    }
    writeQueue(remaining);
    setPending(remaining.filter((n) => n.event_id === eventId && n.team_id === teamId));
    if (remaining.length < queue.length) {
      toast.success(t("synced"));
      void reload();
    }
  }, [supabase, eventId, teamId, reload, t]);

  useEffect(() => {
    void flushQueue();
    const onOnline = () => void flushQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flushQueue]);

  useEffect(() => {
    const channel = supabase
      .channel(`notes-${eventId}-${teamId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notes",
          filter: `team_id=eq.${teamId}`,
        },
        async (payload) => {
          const note = payload.new as {
            author_id?: string;
            is_shared?: boolean;
          };
          const old = payload.old as { is_shared?: boolean };
          const newlyShared =
            note?.is_shared &&
            note.author_id !== userId &&
            (payload.eventType === "INSERT" || old?.is_shared !== true);
          if (newlyShared) {
            const { data: author } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", note.author_id!)
              .maybeSingle();
            toast.info(t("sharedToast", { name: author?.full_name ?? t("someone") }));
          }
          void reload();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, eventId, teamId, userId, reload, t]);

  function queueNote(text: string) {
    const note: PendingNote = {
      tempId: crypto.randomUUID(),
      event_id: eventId,
      team_id: teamId,
      author_id: userId,
      body: text,
      is_shared: shared,
      created_at: new Date().toISOString(),
    };
    writeQueue([...readQueue(), note]);
    setPending((current) => [...current, note]);
    setBody("");
    toast.warning(t("offline"));
  }

  async function addNote(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;

    if (!navigator.onLine) {
      queueNote(text);
      return;
    }

    // Se vacía al momento para poder escribir la siguiente nota sin esperar.
    setBody("");
    setSaving(true);
    const { error } = await supabase.from("notes").insert({
      event_id: eventId,
      team_id: teamId,
      author_id: userId,
      body: text,
      is_shared: shared,
    });
    setSaving(false);

    if (error) {
      if (!navigator.onLine || /fetch|network/i.test(error.message)) {
        queueNote(text);
      } else {
        toast.error(t("saveError"));
        setBody((current) => current || text);
      }
      return;
    }
    void reload();
  }

  async function toggleShared(note: Note) {
    const { error } = await supabase
      .from("notes")
      .update({ is_shared: !note.is_shared })
      .eq("event_id", eventId)
      .eq("id", note.id);
    if (error) toast.error(t("visibilityError"));
    else void reload();
  }

  async function deleteNote(note: Note) {
    const { error } = await supabase.from("notes").delete().eq("id", note.id).eq("event_id", eventId);
    if (error) toast.error(t("deleteError"));
    else void reload();
  }

  const visible = notes.filter((note) =>
    filter === "mine"
      ? note.author_id === userId
      : filter === "shared"
        ? note.is_shared
        : true,
  );

  return (
    <section className="space-y-4">
      <form className="space-y-3" onSubmit={addNote}>
        <Textarea
          aria-label={t("new")}
          className="min-h-24 bg-card"
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              void addNote(event);
            }
          }}
          placeholder={t("placeholder")}
          value={body}
        />
        <div className="flex items-center justify-between gap-3">
          <button
            aria-pressed={shared}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold",
              shared
                ? "border-sky-400/60 bg-sky-400/15"
                : "border-border",
            )}
            onClick={() => setShared((value) => !value)}
            type="button"
          >
            {shared ? (
              <>
                <Users className="size-4" /> {t("sharedWithJury")}
              </>
            ) : (
              <>
                <Lock className="size-4" /> {t("private")}
              </>
            )}
          </button>
          <Button disabled={saving || !body.trim()} type="submit">
            {saving ? t("saving") : t("add")}
          </Button>
        </div>
      </form>

      <div className="flex gap-2 text-sm">
        {(
          [
            ["all", t("filterAll")],
            ["mine", t("filterMine")],
            ["shared", t("filterShared")],
          ] as const
        ).map(([key, label]) => (
          <button
            className={cn(
              "rounded-md px-2.5 py-1 font-semibold",
              filter === key
                ? "bg-navy-900 text-white dark:bg-orange-100 dark:text-navy-900"
                : "hover:bg-navy-900/5 dark:hover:bg-white/10",
            )}
            key={key}
            onClick={() => setFilter(key)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {pending.length ? (
        <ul className="space-y-2">
          {pending.map((note) => (
            <li
              className="rounded-xl border border-dashed border-orange-500/60 bg-orange-500/5 p-3 text-sm"
              key={note.tempId}
            >
              <p className="mb-1 text-xs font-semibold text-muted-foreground">
                {t("pending")}
              </p>
              <p className="whitespace-pre-wrap">{note.body}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((note) => {
            const mine = note.author_id === userId;
            return (
              <li
                className="rounded-xl border border-border bg-white p-3 dark:bg-card"
                key={note.id}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    <strong className="text-foreground">
                      {mine ? t("you") : (note.author?.full_name ?? t("user"))}
                    </strong>{" "}
                    · {format.dateTime(new Date(note.created_at), { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })} ·{" "}
                    {note.is_shared ? t("badgeShared") : t("badgePrivate")}
                  </span>
                  {mine ? (
                    <span className="flex gap-1">
                      <Button
                        className="h-7 px-2 text-xs"
                        onClick={() => void toggleShared(note)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {note.is_shared ? t("makePrivate") : t("share")}
                      </Button>
                      <Button
                        aria-label={t("delete")}
                        className="h-7 px-2"
                        onClick={() => void deleteNote(note)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </span>
                  ) : null}
                </div>
                <p className="text-sm leading-6 whitespace-pre-wrap">
                  {note.body}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

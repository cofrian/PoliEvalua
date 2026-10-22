"use client";

import { Mic2 } from "lucide-react";
import { useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";

import { acknowledgeRecordingNoticeAction } from "@/app/(app)/recording-notice-actions";
import { Button } from "@/components/ui/button";

/**
 * Aviso bloqueante: hasta confirmarlo no se puede usar el espacio. Se muestra
 * a cada miembro una vez por versión del texto.
 */
export function RecordingNoticeDialog({
  spaceName,
  text,
  guarantee,
}: {
  spaceName: string;
  text: string;
  guarantee: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    buttonRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  function acknowledge() {
    startTransition(async () => {
      try {
        await acknowledgeRecordingNoticeAction();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se ha podido guardar.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        aria-describedby="recording-notice-text"
        aria-labelledby="recording-notice-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-xl border border-border bg-white p-6 shadow-xl dark:bg-card"
        role="dialog"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Mic2 aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{spaceName}</p>
            <h2 className="font-heading text-xl font-semibold" id="recording-notice-title">
              Las exposiciones se grabarán
            </h2>
          </div>
        </div>
        <div className="mt-4 space-y-3 text-sm leading-6" id="recording-notice-text">
          <p className="whitespace-pre-line">{text}</p>
          {guarantee ? <p className="font-semibold">{guarantee}</p> : null}
        </div>
        <Button className="mt-6 w-full" disabled={pending} onClick={acknowledge} ref={buttonRef} type="button">
          {pending ? "Guardando…" : "Entendido"}
        </Button>
      </div>
    </div>
  );
}

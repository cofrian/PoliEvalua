"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Botón de envío para acciones que borran o desactivan: pide confirmación en
 * un diálogo y solo entonces envía el formulario que lo contiene.
 */
export function ConfirmSubmit({
  children,
  title,
  description,
  confirmLabel,
  className,
}: {
  children: ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  className?: string;
}) {
  const t = useTranslations("common");
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        className={cn("h-9 text-destructive hover:text-destructive", className)}
        onClick={() => setOpen(true)}
        ref={button}
        type="button"
        variant="ghost"
      >
        {children}
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button
              onClick={() => {
                setOpen(false);
                button.current?.form?.requestSubmit();
              }}
              type="button"
              variant="destructive"
            >
              {confirmLabel ?? t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

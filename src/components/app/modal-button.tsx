"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Botón que abre una ventana con un formulario (crear, importar…), para que la
 * página muestre primero lo importante y no todos los formularios seguidos.
 */
export function ModalButton({
  label,
  title,
  description,
  children,
  variant = "default",
  closeOnSubmit = false,
  wide = false,
}: {
  label: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  variant?: "default" | "outline";
  /** Cerrar al enviar (formularios sin mensaje de resultado). */
  closeOnSubmit?: boolean;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button type="button" variant={variant}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className={wide ? "max-h-[90svh] overflow-y-auto sm:max-w-3xl" : "max-h-[90svh] overflow-y-auto sm:max-w-xl"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div
          onSubmitCapture={() => {
            // Se deja terminar el envío antes de cerrar.
            if (closeOnSubmit) setTimeout(() => setOpen(false), 0);
          }}
        >
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

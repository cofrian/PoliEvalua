"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Copia un texto al portapapeles y lo confirma en el propio botón. */
export function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          toast.error("No se ha podido copiar; selecciónalo y cópialo a mano.");
        }
      }}
      size="sm"
      type="button"
      variant="outline"
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? "Copiado" : label}
    </Button>
  );
}

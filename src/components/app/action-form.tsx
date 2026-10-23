"use client";

import { useRef, useTransition, type ComponentProps, type ReactNode } from "react";
import { toast } from "sonner";

export type ActionResult = { error?: string; message?: string } | void;

/**
 * Formulario para las acciones de gestión. Si la acción devuelve un error lo
 * enseña como aviso, en vez de romper la página (Next oculta en producción el
 * texto de los errores que se lanzan desde el servidor).
 */
export function ActionForm({
  action,
  children,
  resetOnSuccess = false,
  ...props
}: Omit<ComponentProps<"form">, "action"> & {
  action: (formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  /** Vaciar los campos al terminar bien (p. ej. «añadir integrante»). */
  resetOnSuccess?: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      {...props}
      action={(formData) => {
        startTransition(async () => {
          const result = await action(formData);
          if (result && result.error) {
            toast.error(result.error);
            return;
          }
          if (result && result.message) toast.success(result.message);
          if (resetOnSuccess) form.current?.reset();
        });
      }}
      aria-busy={pending}
      ref={form}
    >
      {children}
    </form>
  );
}

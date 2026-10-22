"use client";

import { useTheme } from "next-themes";
import { useActionState, useEffect, useState } from "react";

import { updateProfileAction, type ProfileState } from "@/app/(app)/perfil/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function ProfileForm({
  fullName,
  organization,
  avatarUrl,
  email,
}: {
  fullName: string;
  organization: string | null;
  avatarUrl: string | null;
  email: string;
}) {
  const [state, formAction] = useActionState<ProfileState, FormData>(
    updateProfileAction,
    null,
  );
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      <div className="flex items-center gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt="Tu foto"
            className="size-20 rounded-full object-cover"
            src={preview}
          />
        ) : (
          <span className="flex size-20 items-center justify-center rounded-full bg-sky-400 font-display text-xl text-white">
            {fullName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="space-y-2 text-sm">
          <label className="block font-semibold">
            Foto
            <input
              accept="image/*"
              className="mt-1 block text-sm font-normal"
              name="avatar"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setPreview(URL.createObjectURL(file));
              }}
              type="file"
            />
          </label>
          {avatarUrl ? (
            <label className="flex items-center gap-2">
              <input name="removeAvatar" type="checkbox" /> Quitar foto
            </label>
          ) : null}
        </div>
      </div>

      <label className="block space-y-1 text-sm font-semibold">
        <span>Nombre completo</span>
        <Input defaultValue={fullName} name="fullName" required />
      </label>
      <label className="block space-y-1 text-sm font-semibold">
        <span>Organización</span>
        <Input
          defaultValue={organization ?? ""}
          name="organization"
          placeholder="Empresa, universidad…"
        />
      </label>
      <p className="text-sm text-muted-foreground">Correo: {email}</p>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Tema</legend>
        <div className="flex gap-2">
          {[
            ["light", "Claro"],
            ["dark", "Oscuro"],
            ["system", "Automático"],
          ].map(([value, label]) => (
            <button
              aria-pressed={mounted && theme === value}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-semibold",
                mounted && theme === value
                  ? "border-navy-900 bg-navy-900 text-white dark:border-orange-100 dark:bg-orange-100 dark:text-navy-900"
                  : "border-border",
              )}
              key={value}
              onClick={() => setTheme(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {state ? (
        <p
          className={
            state.ok
              ? "rounded-lg border border-leaf-500/50 bg-leaf-500/10 px-3 py-2 text-sm"
              : "rounded-lg border border-coral-400/50 bg-coral-400/10 px-3 py-2 text-sm"
          }
          role="status"
        >
          {state.message}
        </p>
      ) : null}
      <div className="max-w-xs">
        <SubmitButton idleLabel="Guardar perfil" pendingLabel="Guardando…" />
      </div>
    </form>
  );
}

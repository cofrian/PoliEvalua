"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useActionState, useEffect, useState } from "react";

import { FileField } from "@/components/app/file-field";
import { updateProfileAction, type ProfileState } from "@/app/(app)/perfil/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { LOCALES, localeNames } from "@/i18n/config";
import { cn } from "@/lib/utils";

export function ProfileForm({
  fullName,
  organization,
  avatarUrl,
  email,
  emailNotifications,
  locale,
}: {
  fullName: string;
  organization: string | null;
  avatarUrl: string | null;
  email: string;
  emailNotifications: boolean;
  locale: string | null;
}) {
  const t = useTranslations("profile");
  const tLocale = useTranslations("locale");
  const tTheme = useTranslations("userMenu");
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
          // Fondo en vez de <img src>: la vista previa local (blob:) no pasa por
          // ningún atributo que el navegador interprete como HTML o script.
          <span
            aria-label={t("photoAlt")}
            className="block size-20 rounded-full bg-muted bg-cover bg-center"
            role="img"
            style={{ backgroundImage: `url("${encodeURI(preview)}")` }}
          />
        ) : (
          <span className="flex size-20 items-center justify-center rounded-full bg-sky-400 font-display text-xl text-white">
            {fullName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="space-y-2 text-sm">
          <p className="font-semibold">{t("photo")}</p>
          <FileField
            accept="image/*"
            label={t("photo")}
            name="avatar"
            onChange={(event) => {
              // Vista previa local: solo imágenes y solo URLs blob: creadas por el navegador.
              const file = event.target.files?.[0];
              if (!file || !file.type.startsWith("image/")) return;
              const url = URL.createObjectURL(file);
              if (url.startsWith("blob:")) setPreview(url);
            }}
          />
          {avatarUrl ? (
            <label className="flex items-center gap-2">
              <input name="removeAvatar" type="checkbox" /> {t("removePhoto")}
            </label>
          ) : null}
        </div>
      </div>

      <label className="block space-y-1 text-sm font-semibold">
        <span>{t("fullName")}</span>
        <Input defaultValue={fullName} name="fullName" required />
      </label>
      <label className="block space-y-1 text-sm font-semibold">
        <span>{t("organization")}</span>
        <Input
          defaultValue={organization ?? ""}
          name="organization"
          placeholder={t("organizationPlaceholder")}
        />
      </label>
      <p className="text-sm text-muted-foreground">{t("email", { email })}</p>

      <label className="block space-y-1 text-sm font-semibold">
        <span>{tLocale("label")}</span>
        <select
          className="block h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 text-sm font-normal"
          defaultValue={locale ?? ""}
          name="locale"
        >
          <option value="">{tLocale("browser")}</option>
          {LOCALES.map((value) => (
            <option key={value} lang={value} value={value}>
              {localeNames[value]}
            </option>
          ))}
        </select>
        <span className="block text-xs font-normal text-muted-foreground">{tLocale("hint")}</span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input className="mt-1" defaultChecked={emailNotifications} name="emailNotifications" type="checkbox" />
        <span>
          <span className="block font-semibold">{t("emailNotifications")}</span>
          <span className="block text-xs text-muted-foreground">{t("emailNotificationsHint")}</span>
        </span>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t("theme")}</legend>
        <div className="flex gap-2">
          {[
            ["light", tTheme("light")],
            ["dark", tTheme("dark")],
            ["system", t("auto")],
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
        <SubmitButton idleLabel={t("save")} pendingLabel={t("saving")} />
      </div>
    </form>
  );
}

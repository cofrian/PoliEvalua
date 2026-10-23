"use client";

import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { duplicateSpaceAction, type DuplicateSpaceState } from "@/app/(app)/espacios/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** Reutilizar un espacio para el curso siguiente: misma rúbrica y ajustes, sin personas. */
export function DuplicateSpaceForm({ sourceId, sourceName }: { sourceId: string; sourceName: string }) {
  const [state, action] = useActionState<DuplicateSpaceState, FormData>(duplicateSpaceAction, {});
  const t = useTranslations("duplicate");
  const suggested = t("copySuffix", { name: sourceName });
  const [slug, setSlug] = useState(slugify(suggested));

  return (
    <details className="mt-3 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-semibold text-muted-foreground hover:text-foreground">
        <Copy aria-hidden="true" className="size-4" /> {t("summary")}
      </summary>
      <form action={action} className="mt-3 space-y-2">
        <input name="sourceId" type="hidden" value={sourceId} />
        <Input
          aria-label={t("name")}
          defaultValue={suggested}
          name="name"
          onChange={(event) => setSlug(slugify(event.target.value))}
          required
        />
        <Input
          aria-label={t("slug")}
          name="slug"
          onChange={(event) => setSlug(slugify(event.target.value))}
          required
          value={slug}
        />
        <Input
          aria-label={t("code")}
          autoCapitalize="characters"
          className="uppercase"
          minLength={6}
          name="accessCode"
          placeholder={t("codePlaceholder")}
          required
        />
        <p className="text-xs text-muted-foreground">
          {t("note")}
        </p>
        {state.error ? <p className="text-destructive" role="alert">{state.error}</p> : null}
        <SubmitButton idleLabel={t("submit")} pendingLabel={t("pending")} />
      </form>
    </details>
  );
}

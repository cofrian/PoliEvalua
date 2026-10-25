"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { joinSpaceAction, type JoinSpaceState } from "@/app/(app)/espacios/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: JoinSpaceState = {};

export function JoinSpaceForm() {
  const [state, action, pending] = useActionState(joinSpaceAction, initialState);
  const t = useTranslations("join");

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="join-code">{t("code")}</Label>
        <Input
          aria-describedby="join-code-hint"
          autoCapitalize="characters"
          autoComplete="off"
          className="uppercase"
          id="join-code"
          maxLength={60}
          minLength={6}
          name="accessCode"
          placeholder={t("codePlaceholder")}
          required
        />
      </div>
      <Button disabled={pending} type="submit">
        {pending ? t("entering") : t("enter")}
      </Button>
      <p className="text-xs text-muted-foreground sm:col-span-2" id="join-code-hint">
        {t("codeDecidesRole")}
      </p>
      {state.error ? (
        <p className="text-sm text-destructive sm:col-span-2" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

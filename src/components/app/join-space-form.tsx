"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { joinSpaceAction, type JoinSpaceState } from "@/app/(app)/espacios/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectClass } from "@/lib/app/ui";

const initialState: JoinSpaceState = {};

export function JoinSpaceForm() {
  const [state, action, pending] = useActionState(joinSpaceAction, initialState);
  const t = useTranslations("join");
  const tRoles = useTranslations("roles");

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="join-code">{t("code")}</Label>
        <Input
          autoCapitalize="characters"
          autoComplete="off"
          className="uppercase"
          id="join-code"
          maxLength={40}
          minLength={6}
          name="accessCode"
          placeholder={t("codePlaceholder")}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="join-role">{t("as")}</Label>
        <select className={`${selectClass} w-full`} defaultValue="judge" id="join-role" name="role">
          {(["judge", "mentor", "student", "viewer"] as const).map((role) => (
            <option key={role} value={role}>
              {tRoles(role)}
            </option>
          ))}
        </select>
      </div>
      <Button disabled={pending} type="submit">
        {pending ? t("entering") : t("enter")}
      </Button>
      {state.error ? (
        <p className="text-sm text-destructive sm:col-span-3" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

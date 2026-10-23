"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import {
  createInvitationAction,
  type InvitationState,
} from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectClass } from "@/lib/app/ui";

const initialState: InvitationState = {};

export function InvitationForm() {
  const [state, action, pending] = useActionState(
    createInvitationAction,
    initialState,
  );
  const t = useTranslations("invite");
  const tRoles = useTranslations("roles");

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem_7rem_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">{t("email")}</Label>
          <Input id="invite-email" name="email" placeholder={t("emailPlaceholder")} required type="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-role">{t("role")}</Label>
          <select className={`${selectClass} w-full`} defaultValue="judge" id="invite-role" name="role">
            {(["manager", "judge", "mentor", "teacher", "student", "reviewer", "viewer"] as const).map((role) => (
              <option key={role} value={role}>
                {tRoles(role)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-days">{t("expires")}</Label>
          <select className={`${selectClass} w-full`} defaultValue="7" id="invite-days" name="days">
            {[1, 7, 14, 30].map((days) => (
              <option key={days} value={days}>
                {t("days", { count: days })}
              </option>
            ))}
          </select>
        </div>
        <Button disabled={pending} type="submit">{pending ? t("creating") : t("create")}</Button>
      </div>
      {state.error ? <p className="text-sm text-destructive" role="alert">{state.error}</p> : null}
      {state.link ? (
        <div className="rounded-md bg-muted p-3 dark:bg-ink-950">
          <p className="mb-1 text-xs font-semibold">{t("linkTitle")}</p>
          <input aria-label={t("linkLabel")} className="w-full bg-transparent font-mono text-xs" readOnly value={state.link} />
        </div>
      ) : null}
    </form>
  );
}

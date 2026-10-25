"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { loginAction, registerAction, requestPasswordResetAction, updatePasswordAction } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialAuthActionState, type AuthActionState } from "@/lib/auth/types";

function FieldError({ state, name }: { state: AuthActionState; name: string }) {
  const message = state.fieldErrors?.[name]?.[0];
  return message ? (
    <p className="text-sm font-medium text-destructive" id={`${name}-error`}>
      {message}
    </p>
  ) : null;
}

function StatusMessage({ state }: { state: AuthActionState }) {
  if (!state.message) return null;
  return (
    <div
      aria-live="polite"
      className="rounded-lg border border-coral-400/50 bg-coral-400/10 px-3 py-2.5 text-sm leading-5 text-foreground"
      role="alert"
    >
      {state.message}
    </div>
  );
}

function InvitationNotice() {
  const t = useTranslations("auth");
  return (
    <div
      className="rounded-lg border border-upv-blue/50 bg-upv-blue/10 px-3 py-2.5 text-sm"
      role="status"
    >
      {t("invitation")}
    </div>
  );
}

function EmailField({ state }: { state: AuthActionState }) {
  const t = useTranslations("auth");
  return (
    <div className="space-y-2">
      <Label htmlFor="email">{t("email")}</Label>
      <Input
        aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
        aria-invalid={Boolean(state.fieldErrors?.email)}
        autoComplete="email"
        className="h-11"
        defaultValue={state.values?.email}
        id="email"
        name="email"
        placeholder={t("emailPlaceholder")}
        required
        type="email"
      />
      <FieldError name="email" state={state} />
    </div>
  );
}

function PasswordField({ state, registering = false, label }: { state: AuthActionState; registering?: boolean; label?: string }) {
  const t = useTranslations("auth");
  return (
    <div className="space-y-2">
      <Label htmlFor="password">{label ?? t("password")}</Label>
      <Input
        aria-describedby={state.fieldErrors?.password ? "password-error" : "password-hint"}
        aria-invalid={Boolean(state.fieldErrors?.password)}
        autoComplete={registering ? "new-password" : "current-password"}
        className="h-11"
        id="password"
        maxLength={72}
        minLength={8}
        name="password"
        placeholder={t("passwordPlaceholder")}
        required
        type="password"
      />
      {registering ? (
        <p className="text-xs text-muted-foreground" id="password-hint">
          {t("passwordHint")}
        </p>
      ) : null}
      <FieldError name="password" state={state} />
    </div>
  );
}

export function LoginForm({ inviteToken, notice }: { inviteToken?: string; notice?: string }) {
  const [state, formAction] = useActionState(loginAction, initialAuthActionState);
  const t = useTranslations("auth");
  const registerHref = inviteToken
    ? `/registro?invite=${encodeURIComponent(inviteToken)}`
    : "/registro";

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {notice ? (
        <div className="rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-2.5 text-sm" role="status">
          {notice}
        </div>
      ) : null}
      <StatusMessage state={state} />
      {inviteToken ? <InvitationNotice /> : null}
      <input name="inviteToken" type="hidden" value={inviteToken ?? ""} />
      <EmailField state={state} />
      <PasswordField state={state} />
      <p className="-mt-2 text-right text-sm">
        <Link className="font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground" href="/recuperar">
          {t("forgot")}
        </Link>
      </p>
      <SubmitButton idleLabel={t("login")} pendingLabel={t("loggingIn")} />
      <p className="text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link className="font-semibold text-foreground underline underline-offset-4" href={registerHref}>
          {t("createAccount")}
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ inviteToken }: { inviteToken?: string }) {
  const [state, formAction] = useActionState(registerAction, initialAuthActionState);
  const t = useTranslations("auth");
  const loginHref = inviteToken ? `/login?invite=${encodeURIComponent(inviteToken)}` : "/login";

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <StatusMessage state={state} />
      {inviteToken ? <InvitationNotice /> : null}
      <input name="inviteToken" type="hidden" value={inviteToken ?? ""} />
      <div className="space-y-2">
        <Label htmlFor="fullName">{t("fullName")}</Label>
        <Input
          aria-describedby={state.fieldErrors?.fullName ? "fullName-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.fullName)}
          autoComplete="name"
          className="h-11"
          defaultValue={state.values?.fullName}
          id="fullName"
          name="fullName"
          placeholder={t("fullNamePlaceholder")}
          required
        />
        <FieldError name="fullName" state={state} />
      </div>
      <EmailField state={state} />
      <PasswordField registering state={state} />
      <SubmitButton idleLabel={t("register")} pendingLabel={t("registering")} />
      <p className="text-center text-sm text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link className="font-semibold text-foreground underline underline-offset-4" href={loginHref}>
          {t("enter")}
        </Link>
      </p>
    </form>
  );
}

export function ResetRequestForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, initialAuthActionState);
  const t = useTranslations("auth");

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.status === "success" ? (
        <div aria-live="polite" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm" role="status">
          {state.message}
        </div>
      ) : (
        <StatusMessage state={state} />
      )}
      <EmailField state={state} />
      <SubmitButton idleLabel={t("resetSend")} pendingLabel={t("resetSending")} />
      <p className="text-center text-sm">
        <Link className="font-semibold text-foreground underline underline-offset-4" href="/login">
          {t("resetBack")}
        </Link>
      </p>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, formAction] = useActionState(updatePasswordAction, initialAuthActionState);
  const t = useTranslations("auth");

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <StatusMessage state={state} />
      <PasswordField label={t("newMeta")} registering state={state} />
      <SubmitButton idleLabel={t("newSave")} pendingLabel={t("newSaving")} />
    </form>
  );
}

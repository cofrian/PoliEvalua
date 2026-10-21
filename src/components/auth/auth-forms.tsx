"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, registerAction } from "@/app/(auth)/actions";
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
  return (
    <div
      className="rounded-lg border border-upv-blue/50 bg-upv-blue/10 px-3 py-2.5 text-sm"
      role="status"
    >
      Esta invitación añadirá el espacio y el rol correspondiente a tu cuenta.
    </div>
  );
}

function EmailField({ state }: { state: AuthActionState }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="email">Correo electrónico</Label>
      <Input
        aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
        aria-invalid={Boolean(state.fieldErrors?.email)}
        autoComplete="email"
        className="h-11"
        defaultValue={state.values?.email}
        id="email"
        name="email"
        placeholder="tu@correo.com"
        required
        type="email"
      />
      <FieldError name="email" state={state} />
    </div>
  );
}

function PasswordField({ state, registering = false }: { state: AuthActionState; registering?: boolean }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="password">Contraseña</Label>
      <Input
        aria-describedby={state.fieldErrors?.password ? "password-error" : "password-hint"}
        aria-invalid={Boolean(state.fieldErrors?.password)}
        autoComplete={registering ? "new-password" : "current-password"}
        className="h-11"
        id="password"
        maxLength={72}
        minLength={8}
        name="password"
        placeholder="Mínimo 8 caracteres"
        required
        type="password"
      />
      {registering ? (
        <p className="text-xs text-muted-foreground" id="password-hint">
          Podrás usar esta cuenta en todos tus espacios.
        </p>
      ) : null}
      <FieldError name="password" state={state} />
    </div>
  );
}

export function LoginForm({ inviteToken, notice }: { inviteToken?: string; notice?: string }) {
  const [state, formAction] = useActionState(loginAction, initialAuthActionState);
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
      <SubmitButton idleLabel="Entrar en la plataforma" pendingLabel="Entrando…" />
      <p className="text-center text-sm text-muted-foreground">
        ¿Todavía no tienes cuenta?{" "}
        <Link className="font-semibold text-foreground underline underline-offset-4" href={registerHref}>
          Crear cuenta
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ inviteToken }: { inviteToken?: string }) {
  const [state, formAction] = useActionState(registerAction, initialAuthActionState);
  const loginHref = inviteToken ? `/login?invite=${encodeURIComponent(inviteToken)}` : "/login";

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <StatusMessage state={state} />
      {inviteToken ? <InvitationNotice /> : null}
      <input name="inviteToken" type="hidden" value={inviteToken ?? ""} />
      <div className="space-y-2">
        <Label htmlFor="fullName">Nombre completo</Label>
        <Input
          aria-describedby={state.fieldErrors?.fullName ? "fullName-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.fullName)}
          autoComplete="name"
          className="h-11"
          defaultValue={state.values?.fullName}
          id="fullName"
          name="fullName"
          placeholder="Nombre y apellidos"
          required
        />
        <FieldError name="fullName" state={state} />
      </div>
      <EmailField state={state} />
      <PasswordField registering state={state} />
      <SubmitButton idleLabel="Crear mi cuenta" pendingLabel="Creando cuenta…" />
      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link className="font-semibold text-foreground underline underline-offset-4" href={loginHref}>
          Entrar
        </Link>
      </p>
    </form>
  );
}

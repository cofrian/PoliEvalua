"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  loginAction,
  registerAction,
  requestPasswordResetAction,
  updatePasswordAction,
} from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  initialAuthActionState,
  type AuthActionState,
} from "@/lib/auth/types";

function FieldError({ state, name }: { state: AuthActionState; name: string }) {
  const message = state.fieldErrors?.[name]?.[0];

  if (!message) return null;

  return (
    <p className="text-sm font-medium text-destructive" id={`${name}-error`}>
      {message}
    </p>
  );
}

function StatusMessage({ state }: { state: AuthActionState }) {
  if (!state.message) return null;

  return (
    <div
      aria-live="polite"
      className={
        state.status === "success"
          ? "rounded-lg border border-leaf-500/40 bg-leaf-500/10 px-3 py-2.5 text-sm leading-5 text-foreground"
          : "rounded-lg border border-coral-400/50 bg-coral-400/10 px-3 py-2.5 text-sm leading-5 text-foreground"
      }
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </div>
  );
}

type LoginFormProps = {
  notice?: string;
};

export function LoginForm({ notice }: LoginFormProps) {
  const [state, formAction] = useActionState(
    loginAction,
    initialAuthActionState,
  );

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {notice ? (
        <div
          className="rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-2.5 text-sm leading-5"
          role="status"
        >
          {notice}
        </div>
      ) : null}
      <StatusMessage state={state} />
      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          autoComplete="email"
          className="h-11"
          id="email"
          name="email"
          placeholder="tu@correo.com"
          required
          type="email"
        />
        <FieldError name="email" state={state} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="password">Contraseña</Label>
          <Link
            className="text-xs font-semibold text-navy-700 underline-offset-4 hover:underline dark:text-orange-100"
            href="/recuperar"
          >
            La he olvidado
          </Link>
        </div>
        <Input
          aria-describedby={
            state.fieldErrors?.password ? "password-error" : undefined
          }
          aria-invalid={Boolean(state.fieldErrors?.password)}
          autoComplete="current-password"
          className="h-11"
          id="password"
          name="password"
          required
          type="password"
        />
        <FieldError name="password" state={state} />
      </div>
      <SubmitButton idleLabel="Entrar" pendingLabel="Entrando…" />
      <p className="text-center text-sm text-muted-foreground">
        ¿Primera vez?{" "}
        <Link
          className="font-bold text-navy-700 underline-offset-4 hover:underline dark:text-orange-100"
          href="/registro"
        >
          Crear una cuenta
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [state, formAction] = useActionState(
    registerAction,
    initialAuthActionState,
  );

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <StatusMessage state={state} />
      <div className="space-y-2">
        <Label htmlFor="fullName">Nombre completo</Label>
        <Input
          aria-describedby={
            state.fieldErrors?.fullName ? "fullName-error" : undefined
          }
          aria-invalid={Boolean(state.fieldErrors?.fullName)}
          autoComplete="name"
          className="h-11"
          id="fullName"
          name="fullName"
          placeholder="Nombre y apellidos"
          required
        />
        <FieldError name="fullName" state={state} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          autoComplete="email"
          className="h-11"
          id="email"
          name="email"
          placeholder="tu@correo.com"
          required
          type="email"
        />
        <FieldError name="email" state={state} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          aria-describedby="password-hint password-error"
          aria-invalid={Boolean(state.fieldErrors?.password)}
          autoComplete="new-password"
          className="h-11"
          id="password"
          minLength={8}
          name="password"
          required
          type="password"
        />
        <p className="text-xs text-muted-foreground" id="password-hint">
          Al menos 8 caracteres.
        </p>
        <FieldError name="password" state={state} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="eventCode">Código del evento</Label>
        <Input
          aria-describedby={
            state.fieldErrors?.eventCode ? "eventCode-error" : "eventCode-hint"
          }
          aria-invalid={Boolean(state.fieldErrors?.eventCode)}
          autoCapitalize="characters"
          autoComplete="off"
          className="h-11 uppercase"
          id="eventCode"
          name="eventCode"
          placeholder="Código facilitado por la organización"
          required
        />
        <p className="text-xs text-muted-foreground" id="eventCode-hint">
          Lo recibirás de la organización de València Hack.
        </p>
        <FieldError name="eventCode" state={state} />
      </div>
      <fieldset
        aria-describedby={state.fieldErrors?.role ? "role-error" : undefined}
        className="space-y-2"
      >
        <legend className="text-sm font-medium leading-none">
          Participo como
        </legend>
        <div className="grid grid-cols-2 gap-3 pt-2">
          {[
            { value: "judge", label: "Juez", hint: "Toma notas y evalúa" },
            { value: "mentor", label: "Mentor", hint: "Toma notas, no vota" },
          ].map((option) => (
            <label
              className="flex cursor-pointer flex-col gap-0.5 rounded-lg border border-input px-3 py-2.5 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
              key={option.value}
            >
              <input
                className="sr-only"
                defaultChecked={option.value === "judge"}
                name="role"
                required
                type="radio"
                value={option.value}
              />
              <span className="text-sm font-bold">{option.label}</span>
              <span className="text-xs text-muted-foreground">
                {option.hint}
              </span>
            </label>
          ))}
        </div>
        <FieldError name="role" state={state} />
      </fieldset>
      <SubmitButton idleLabel="Crear cuenta" pendingLabel="Creando cuenta…" />
      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link
          className="font-bold text-navy-700 underline-offset-4 hover:underline dark:text-orange-100"
          href="/login"
        >
          Iniciar sesión
        </Link>
      </p>
    </form>
  );
}

export function RecoverForm() {
  const [state, formAction] = useActionState(
    requestPasswordResetAction,
    initialAuthActionState,
  );

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <StatusMessage state={state} />
      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          autoComplete="email"
          className="h-11"
          id="email"
          name="email"
          placeholder="tu@correo.com"
          required
          type="email"
        />
        <FieldError name="email" state={state} />
      </div>
      <SubmitButton
        idleLabel="Enviar enlace"
        pendingLabel="Enviando enlace…"
      />
      <p className="text-center text-sm">
        <Link
          className="font-bold text-navy-700 underline-offset-4 hover:underline dark:text-orange-100"
          href="/login"
        >
          Volver a iniciar sesión
        </Link>
      </p>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, formAction] = useActionState(
    updatePasswordAction,
    initialAuthActionState,
  );

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <StatusMessage state={state} />
      <div className="space-y-2">
        <Label htmlFor="password">Nueva contraseña</Label>
        <Input
          aria-describedby={
            state.fieldErrors?.password ? "password-error" : "password-hint"
          }
          aria-invalid={Boolean(state.fieldErrors?.password)}
          autoComplete="new-password"
          className="h-11"
          id="password"
          minLength={8}
          name="password"
          required
          type="password"
        />
        <p className="text-xs text-muted-foreground" id="password-hint">
          Al menos 8 caracteres.
        </p>
        <FieldError name="password" state={state} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="passwordConfirmation">Repite la contraseña</Label>
        <Input
          aria-describedby={
            state.fieldErrors?.passwordConfirmation
              ? "passwordConfirmation-error"
              : undefined
          }
          aria-invalid={Boolean(state.fieldErrors?.passwordConfirmation)}
          autoComplete="new-password"
          className="h-11"
          id="passwordConfirmation"
          minLength={8}
          name="passwordConfirmation"
          required
          type="password"
        />
        <FieldError name="passwordConfirmation" state={state} />
      </div>
      <SubmitButton
        idleLabel="Guardar contraseña"
        pendingLabel="Guardando…"
      />
    </form>
  );
}

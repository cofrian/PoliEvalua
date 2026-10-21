"use client";

import { useActionState } from "react";

import { accessAction } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialAuthActionState, type AuthActionState } from "@/lib/auth/types";

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

export function AccessForm({
  inviteToken,
  notice,
}: {
  inviteToken?: string;
  notice?: string;
}) {
  const [state, formAction] = useActionState(
    accessAction,
    initialAuthActionState,
  );

  const values = state.values ?? {};

  return (
    <form
      action={formAction}
      className="space-y-5"
      noValidate
    >
      {notice ? (
        <div
          className="rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-2.5 text-sm leading-5"
          role="status"
        >
          {notice}
        </div>
      ) : null}
      <StatusMessage state={state} />
      {inviteToken ? (
        <div className="rounded-lg border border-upv-blue/50 bg-upv-blue/10 px-3 py-2.5 text-sm" role="status">
          Estás entrando mediante una invitación personal. Usa el mismo correo al que fue dirigida.
        </div>
      ) : null}
      <input name="inviteToken" type="hidden" value={inviteToken ?? ""} />
      <div className="space-y-2">
        <Label htmlFor="fullName">Nombre completo</Label>
        <Input
          aria-describedby={
            state.fieldErrors?.fullName ? "fullName-error" : undefined
          }
          aria-invalid={Boolean(state.fieldErrors?.fullName)}
          autoComplete="name"
          defaultValue={values.fullName}
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
          aria-describedby={
            state.fieldErrors?.email ? "email-error" : "email-hint"
          }
          aria-invalid={Boolean(state.fieldErrors?.email)}
          autoComplete="email"
          defaultValue={values.email}
          className="h-11"
          id="email"
          name="email"
          placeholder="tu@correo.com"
          required
          type="email"
        />
        <p className="text-xs text-muted-foreground" id="email-hint">
          Usa siempre el mismo correo y contraseña para conservar tus notas.
        </p>
        <FieldError name="email" state={state} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          aria-describedby={
            state.fieldErrors?.password ? "password-error" : "password-hint"
          }
          aria-invalid={Boolean(state.fieldErrors?.password)}
          autoComplete="current-password"
          className="h-11"
          id="password"
          minLength={8}
          maxLength={72}
          name="password"
          placeholder="Mínimo 8 caracteres"
          required
          type="password"
        />
        <p className="text-xs text-muted-foreground" id="password-hint">
          En el primer acceso se creará tu cuenta con esta contraseña.
        </p>
        <FieldError name="password" state={state} />
      </div>
      {!inviteToken ? <fieldset
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
                defaultChecked={option.value === (values.role ?? "judge")}
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
      </fieldset> : <input name="role" type="hidden" value="judge" />}
      {!inviteToken ? <div className="space-y-2">
        <Label htmlFor="accessCode">Código de acceso</Label>
        <Input
          aria-describedby={
            state.fieldErrors?.accessCode
              ? "accessCode-error"
              : "accessCode-hint"
          }
          aria-invalid={Boolean(state.fieldErrors?.accessCode)}
          autoCapitalize="characters"
          autoComplete="off"
          className="h-11 uppercase"
          defaultValue={values.accessCode}
          id="accessCode"
          name="accessCode"
          placeholder="Código facilitado por la organización"
          required
        />
        <p className="text-xs text-muted-foreground" id="accessCode-hint">
          Te lo da la organización del evento.
        </p>
        <FieldError name="accessCode" state={state} />
      </div> : <input name="accessCode" type="hidden" value="" />}
      <SubmitButton
        idleLabel="Entrar"
        pendingLabel="Entrando…"
      />
    </form>
  );
}

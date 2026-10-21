"use client";

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

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem_7rem_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Correo</Label>
          <Input id="invite-email" name="email" placeholder="persona@upv.es" required type="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-role">Rol</Label>
          <select className={`${selectClass} w-full`} defaultValue="judge" id="invite-role" name="role">
            <option value="manager">Gestor</option>
            <option value="judge">Juez</option>
            <option value="mentor">Mentor</option>
            <option value="teacher">Docente</option>
            <option value="student">Estudiante</option>
            <option value="reviewer">Evaluador</option>
            <option value="viewer">Consulta</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-days">Caduca</Label>
          <select className={`${selectClass} w-full`} defaultValue="7" id="invite-days" name="days">
            <option value="1">1 día</option>
            <option value="7">7 días</option>
            <option value="14">14 días</option>
            <option value="30">30 días</option>
          </select>
        </div>
        <Button disabled={pending} type="submit">{pending ? "Creando…" : "Crear enlace"}</Button>
      </div>
      {state.error ? <p className="text-sm text-destructive" role="alert">{state.error}</p> : null}
      {state.link ? (
        <div className="rounded-md bg-paper-50 p-3 dark:bg-ink-950">
          <p className="mb-1 text-xs font-semibold">Enlace privado (solo se muestra ahora)</p>
          <input aria-label="Enlace de invitación" className="w-full bg-transparent font-mono text-xs" readOnly value={state.link} />
        </div>
      ) : null}
    </form>
  );
}

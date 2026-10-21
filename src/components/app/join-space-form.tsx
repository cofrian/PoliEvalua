"use client";

import { useActionState } from "react";

import { joinSpaceAction, type JoinSpaceState } from "@/app/(app)/espacios/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectClass } from "@/lib/app/ui";

const initialState: JoinSpaceState = {};

export function JoinSpaceForm() {
  const [state, action, pending] = useActionState(joinSpaceAction, initialState);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="join-code">Código del espacio</Label>
        <Input
          autoCapitalize="characters"
          autoComplete="off"
          className="uppercase"
          id="join-code"
          maxLength={40}
          minLength={6}
          name="accessCode"
          placeholder="Código de la organización"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="join-role">Participaré como</Label>
        <select className={`${selectClass} w-full`} defaultValue="judge" id="join-role" name="role">
          <option value="judge">Juez</option>
          <option value="mentor">Mentor</option>
          <option value="student">Estudiante</option>
          <option value="reviewer">Evaluador</option>
          <option value="viewer">Consulta</option>
        </select>
      </div>
      <Button disabled={pending} type="submit">
        {pending ? "Entrando…" : "Entrar al espacio"}
      </Button>
      {state.error ? (
        <p className="text-sm text-destructive sm:col-span-3" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

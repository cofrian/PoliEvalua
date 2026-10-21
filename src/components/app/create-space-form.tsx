"use client";

import { useActionState, useState } from "react";

import {
  createSpaceAction,
  type CreateSpaceState,
} from "@/app/(app)/espacios/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "@/lib/app/ui";

const initialState: CreateSpaceState = {};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function CreateSpaceForm() {
  const [state, action, pending] = useActionState(
    createSpaceAction,
    initialState,
  );
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  return (
    <form action={action} className="space-y-6">
      {state.error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="name">Nombre del espacio</Label>
        <Input
          id="name"
          name="name"
          onChange={(event) => {
            if (!slugEdited) setSlug(slugify(event.target.value));
          }}
          placeholder="Premios de innovación 2027"
          required
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="kind">Tipo de actividad</Label>
          <select className={`${selectClass} w-full`} defaultValue="hackathon" id="kind" name="kind">
            <option value="hackathon">Hackathon o evento</option>
            <option value="class">Asignatura</option>
            <option value="awards">Premios o convocatoria</option>
            <option value="project">Proyectos</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">Identificador web</Label>
          <Input
            id="slug"
            name="slug"
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(slugify(event.target.value));
            }}
            placeholder="premios-innovacion-2027"
            required
            value={slug}
          />
          <p className="text-xs text-muted-foreground">Solo letras minúsculas, números y guiones.</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descripción</Label>
        <Textarea id="description" maxLength={500} name="description" placeholder="Qué se va a evaluar y quién participa." />
      </div>

      <div className="space-y-2">
        <Label htmlFor="accessCode">Código de acceso inicial</Label>
        <Input
          autoCapitalize="characters"
          autoComplete="off"
          className="uppercase"
          id="accessCode"
          minLength={6}
          name="accessCode"
          placeholder="INNOVA-2027"
          required
        />
        <p className="text-xs text-muted-foreground">
          Podrás cerrarlo o cambiarlo después. Los miembros desactivados no recuperan el acceso usando el código.
        </p>
      </div>

      <Button disabled={pending} type="submit">
        {pending ? "Creando espacio…" : "Crear espacio"}
      </Button>
    </form>
  );
}

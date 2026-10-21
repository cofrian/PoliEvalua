import { Plus } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";

import { selectSpaceAction } from "@/app/(app)/espacios/actions";
import { JoinSpaceForm } from "@/components/app/join-space-form";
import { Button } from "@/components/ui/button";
import { getAccount, roleLabels, type SpaceRole } from "@/lib/app/session";

const kindLabels = {
  hackathon: "Hackathon",
  class: "Asignatura",
  awards: "Premios",
  project: "Proyectos",
  custom: "Personalizado",
} as const;

type SpaceRelation = {
  id: string;
  name: string;
  slug: string;
  kind: keyof typeof kindLabels;
  status: string;
  settings: {
    participant_mode?: "teams" | "groups" | "individuals" | "candidates";
    evaluation_mode?: "rubric" | "feedback" | "mixed";
  } | null;
};

const participantLabels = {
  teams: "Equipos",
  groups: "Grupos",
  individuals: "Proyectos individuales",
  candidates: "Candidaturas",
} as const;

const evaluationLabels = {
  rubric: "Rúbrica",
  feedback: "Preguntas y comentarios",
  mixed: "Puntuación y comentarios",
} as const;

export default async function SpacesPage() {
  const { supabase, user } = await getAccount();
  const activeEventId = (await cookies()).get("active_event_id")?.value;
  const { data } = await supabase
    .from("event_members")
    .select("event_id, role, events(id, name, slug, kind, status, settings)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at");
  const memberships = data ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-upv-500 dark:text-upv-300">Tus espacios</p>
          <h1 className="mt-2 font-heading text-3xl font-bold sm:text-4xl">Elige dónde quieres trabajar</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Tu cuenta es común, pero los miembros, permisos, notas y resultados están separados en cada espacio.
          </p>
        </div>
        <Button asChild>
          <Link href="/espacios/nuevo"><Plus aria-hidden="true" />Nuevo espacio</Link>
        </Button>
      </div>

      {memberships.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {memberships.map((membership) => {
            const relation = membership.events as SpaceRelation | SpaceRelation[] | null;
            const space = Array.isArray(relation) ? relation[0] : relation;
            if (!space) return null;
            const active = space.id === activeEventId;
            return (
              <article className="rounded-xl border border-line bg-white p-5 dark:border-[#383C3D] dark:bg-[#1B1D1E]" key={space.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-upv-500 dark:text-upv-300">{kindLabels[space.kind]}</p>
                    <h2 className="mt-2 font-heading text-xl font-semibold">{space.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{roleLabels[membership.role as SpaceRole]}</p>
                    {space.settings?.participant_mode && space.settings?.evaluation_mode ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {participantLabels[space.settings.participant_mode]} · {evaluationLabels[space.settings.evaluation_mode]}
                      </p>
                    ) : null}
                  </div>
                  {active ? <span className="rounded-full bg-upv-blue/20 px-2.5 py-1 text-xs font-semibold">Último espacio</span> : null}
                </div>
                <form action={selectSpaceAction} className="mt-5">
                  <input name="eventId" type="hidden" value={space.id} />
                  <Button className="w-full" type="submit" variant={active ? "outline" : "default"}>
                    Entrar al espacio
                  </Button>
                </form>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="rounded-xl border border-dashed border-line bg-white p-8 text-center dark:border-[#383C3D] dark:bg-[#1B1D1E]">
          <h2 className="font-heading text-2xl font-semibold">Tu cuenta ya está lista</h2>
          <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
            Crea tu primer espacio o introduce el código que te haya facilitado una organización.
          </p>
          <Button asChild className="mt-5">
            <Link href="/espacios/nuevo"><Plus aria-hidden="true" />Crear mi primer espacio</Link>
          </Button>
        </section>
      )}

      <section className="rounded-xl border border-line bg-white p-5 sm:p-6 dark:border-[#383C3D] dark:bg-[#1B1D1E]">
        <h2 className="font-heading text-xl font-semibold">Entrar con un código de espacio</h2>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">
          Este código solo sirve para añadir un espacio a tu cuenta; nunca se pide para entrar en la plataforma.
        </p>
        <JoinSpaceForm />
      </section>
    </div>
  );
}

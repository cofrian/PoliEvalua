import { Plus } from "lucide-react";
import Link from "next/link";

import { selectSpaceAction } from "@/app/(app)/espacios/actions";
import { Button } from "@/components/ui/button";
import { getSession, roleLabels, type SpaceRole } from "@/lib/app/session";

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
};

export default async function SpacesPage() {
  const { supabase, user, event } = await getSession();
  const { data } = await supabase
    .from("event_members")
    .select("event_id, role, events(id, name, slug, kind, status)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at");

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-upv-500 dark:text-upv-300">Tus espacios</p>
          <h1 className="mt-2 font-heading text-3xl font-bold sm:text-4xl">Elige dónde quieres trabajar</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Los miembros, formularios, notas y resultados de cada espacio están separados mediante RLS.
          </p>
        </div>
        <Button asChild>
          <Link href="/espacios/nuevo"><Plus aria-hidden="true" />Nuevo espacio</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(data ?? []).map((membership) => {
          const relation = membership.events as SpaceRelation | SpaceRelation[] | null;
          const space = Array.isArray(relation) ? relation[0] : relation;
          if (!space) return null;
          const active = space.id === event.id;
          return (
            <article className="rounded-xl border border-line bg-white p-5 dark:border-[#383C3D] dark:bg-[#1B1D1E]" key={space.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-upv-500 dark:text-upv-300">{kindLabels[space.kind]}</p>
                  <h2 className="mt-2 font-heading text-xl font-semibold">{space.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{roleLabels[membership.role as SpaceRole]}</p>
                </div>
                {active ? <span className="rounded-full bg-upv-blue/20 px-2.5 py-1 text-xs font-semibold">Activo</span> : null}
              </div>
              <form action={selectSpaceAction} className="mt-5">
                <input name="eventId" type="hidden" value={space.id} />
                <Button className="w-full" type="submit" variant={active ? "outline" : "default"}>
                  {active ? "Volver al espacio" : "Abrir espacio"}
                </Button>
              </form>
            </article>
          );
        })}
      </div>
    </div>
  );
}

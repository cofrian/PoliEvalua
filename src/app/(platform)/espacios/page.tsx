import { Plus } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { selectSpaceAction } from "@/app/(app)/espacios/actions";
import { DuplicateSpaceForm } from "@/components/app/duplicate-space-form";
import { JoinSpaceForm } from "@/components/app/join-space-form";
import { Button } from "@/components/ui/button";
import { getAccount, type SpaceRole } from "@/lib/app/session";

type SpaceRelation = {
  id: string;
  name: string;
  slug: string;
  kind: "hackathon" | "class" | "awards" | "project" | "custom";
  status: string;
  settings: {
    participant_mode?: "teams" | "groups" | "individuals" | "candidates";
    evaluation_mode?: "rubric" | "feedback" | "mixed";
  } | null;
};

export default async function SpacesPage() {
  const { supabase, user } = await getAccount();
  const [t, tKinds, tModes, tEval, tRoles] = await Promise.all([
    getTranslations("spaces"),
    getTranslations("spaceKinds"),
    getTranslations("participantModes"),
    getTranslations("evaluationModes"),
    getTranslations("roles"),
  ]);
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
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-upv-500 dark:text-upv-300">{t("kicker")}</p>
          <h1 className="mt-2 font-heading text-3xl font-bold sm:text-4xl">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {t("lead")}
          </p>
        </div>
        <Button asChild>
          <Link href="/espacios/nuevo"><Plus aria-hidden="true" />{t("new")}</Link>
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
              <article className="rounded-xl border border-border bg-white p-5 dark:bg-card" key={space.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-upv-500 dark:text-upv-300">{tKinds(space.kind)}</p>
                    <h2 className="mt-2 font-heading text-xl font-semibold">{space.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{tRoles(membership.role as SpaceRole)}</p>
                    {space.settings?.participant_mode && space.settings?.evaluation_mode ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {tModes(space.settings.participant_mode)} · {tEval(space.settings.evaluation_mode)}
                      </p>
                    ) : null}
                  </div>
                  {active ? <span className="rounded-full bg-upv-blue/20 px-2.5 py-1 text-xs font-semibold">{t("last")}</span> : null}
                </div>
                <form action={selectSpaceAction} className="mt-5">
                  <input name="eventId" type="hidden" value={space.id} />
                  <Button className="w-full" type="submit" variant={active ? "outline" : "default"}>
                    {t("enter")}
                  </Button>
                </form>
                {membership.role === "owner" || membership.role === "manager" ? (
                  <DuplicateSpaceForm sourceId={space.id} sourceName={space.name} />
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <section className="rounded-xl border border-dashed border-border bg-white p-8 text-center dark:bg-card">
          <h2 className="font-heading text-2xl font-semibold">{t("readyTitle")}</h2>
          <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
            {t("readyText")}
          </p>
          <Button asChild className="mt-5">
            <Link href="/espacios/nuevo"><Plus aria-hidden="true" />{t("createFirst")}</Link>
          </Button>
        </section>
      )}

      <section className="rounded-xl border border-border bg-white p-5 sm:p-6 dark:bg-card">
        <h2 className="font-heading text-xl font-semibold">{t("codeTitle")}</h2>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">
          {t("codeText")}
        </p>
        <JoinSpaceForm />
      </section>
    </div>
  );
}

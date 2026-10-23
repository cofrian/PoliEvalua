import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { deleteChallengeAction, saveChallengeAction } from "@/app/(app)/admin/actions";
import { PageHeader } from "@/components/app/page-header";
import { ConfirmSubmit } from "@/components/app/confirm-submit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSession } from "@/lib/app/session";
import { cardClass } from "@/lib/app/ui";

type Challenge = {
  id: string;
  name: string;
  description: string | null;
  order: number | null;
};

function ChallengeForm({ challenge }: { challenge: Challenge | null }) {
  const t = useTranslations("challengesAdmin");
  return (
    <form action={saveChallengeAction} className="grid gap-3 sm:grid-cols-[6rem_1fr_2fr_auto] sm:items-end">
      <input name="id" type="hidden" value={challenge?.id ?? ""} />
      <label className="space-y-1 text-sm font-semibold">
        <span className="block">{t("order")}</span>
        <Input defaultValue={challenge?.order ?? ""} inputMode="numeric" name="order" />
      </label>
      <label className="space-y-1 text-sm font-semibold">
        <span className="block">{t("name")}</span>
        <Input defaultValue={challenge?.name ?? ""} name="name" required />
      </label>
      <label className="space-y-1 text-sm font-semibold">
        <span className="block">{t("description")}</span>
        <Input defaultValue={challenge?.description ?? ""} name="description" />
      </label>
      <Button type="submit">{challenge ? t("save") : t("create")}</Button>
    </form>
  );
}

export default async function AdminChallengesPage() {
  const { supabase, event } = await getSession();
  const t = await getTranslations("challengesAdmin");
  const [{ data: challenges }, { data: teams }] = await Promise.all([
    supabase.from("challenges").select("id, name, description, order").eq("event_id", event.id).order("order"),
    supabase.from("teams").select("challenge_id").eq("event_id", event.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        description={t("pageDescription")}
        title={t("title")}
      />
    <div className="space-y-4">
      {(challenges ?? []).map((challenge) => {
        const count = (teams ?? []).filter((team) => team.challenge_id === challenge.id).length;
        return (
          <section className={cardClass} key={challenge.id}>
            <ChallengeForm challenge={challenge} />
            <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
              <span>{t("teams", { count })}</span>
              {count === 0 ? (
                <form action={deleteChallengeAction}>
                  <input name="id" type="hidden" value={challenge.id} />
                  <ConfirmSubmit confirmLabel={t("delete")} title={t("deleteTitle", { name: challenge.name })}>
                    {t("delete")}
                  </ConfirmSubmit>
                </form>
              ) : null}
            </div>
          </section>
        );
      })}
      <section className={cardClass}>
        <h2 className="mb-3 font-display text-xl">{t("new")}</h2>
        <ChallengeForm challenge={null} />
      </section>
    </div>
    </div>
  );
}

import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { FileField } from "@/components/app/file-field";
import { deleteSponsorAction, saveSponsorAction } from "@/app/(app)/admin/actions";
import { PageHeader } from "@/components/app/page-header";
import { ConfirmSubmit } from "@/components/app/confirm-submit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSession } from "@/lib/app/session";
import { cardClass } from "@/lib/app/ui";

type Sponsor = {
  id: string;
  name: string;
  url: string | null;
  order: number | null;
  logo_light_url: string | null;
  logo_dark_url: string | null;
  display_height: number;
  aspect_ratio: number;
  dark_background: boolean;
};

function SponsorForm({ sponsor }: { sponsor: Sponsor | null }) {
  const t = useTranslations("sponsorsAdmin");
  return (
    <form action={saveSponsorAction} className="grid gap-3 sm:grid-cols-6">
      <input name="id" type="hidden" value={sponsor?.id ?? ""} />
      <label className="space-y-1 text-sm font-semibold sm:col-span-3">
        <span className="block">{t("name")}</span>
        <Input defaultValue={sponsor?.name ?? ""} name="name" required />
      </label>
      <label className="space-y-1 text-sm font-semibold sm:col-span-2">
        <span className="block">{t("web")}</span>
        <Input defaultValue={sponsor?.url ?? ""} name="url" placeholder="https://" />
      </label>
      <label className="space-y-1 text-sm font-semibold">
        <span className="block">{t("order")}</span>
        <Input defaultValue={sponsor?.order ?? ""} inputMode="numeric" name="order" />
      </label>
      <label className="space-y-1 text-sm font-semibold sm:col-span-2">
        <span className="block">{t("height")}</span>
        <Input
          defaultValue={sponsor?.display_height ?? 40}
          inputMode="numeric"
          name="displayHeight"
        />
      </label>
      <label className="space-y-1 text-sm font-semibold sm:col-span-2">
        <span className="block">{t("ratio")}</span>
        <Input
          defaultValue={sponsor?.aspect_ratio ?? 3}
          inputMode="decimal"
          name="aspectRatio"
        />
      </label>
      <label className="flex items-end gap-2 pb-2 text-sm font-semibold sm:col-span-2">
        <input
          defaultChecked={sponsor?.dark_background ?? true}
          name="darkBackground"
          type="checkbox"
        />
        {t("darkBg")}
      </label>
      <label className="space-y-1 text-sm font-semibold sm:col-span-3">
        <span className="block">{t("logoLight")}</span>
        <FileField accept="image/*" label={t("logoLight")} name="logoLight" />
      </label>
      <label className="space-y-1 text-sm font-semibold sm:col-span-3">
        <span className="block">{t("logoDark")}</span>
        <FileField accept="image/*" label={t("logoDark")} name="logoDark" />
      </label>
      <div className="sm:col-span-6">
        <Button type="submit">{sponsor ? t("save") : t("add")}</Button>
      </div>
    </form>
  );
}

export default async function AdminSponsorsPage() {
  const { supabase, event } = await getSession();
  const t = await getTranslations("sponsorsAdmin");
  const { data: sponsors } = await supabase
    .from("sponsors")
    .select(
      "id, name, url, order, logo_light_url, logo_dark_url, display_height, aspect_ratio, dark_background",
    )
    .eq("event_id", event.id)
    .order("order");

  return (
    <div className="space-y-6">
      <PageHeader
        description={t("description")}
        title={t("title")}
      />
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("help")}
      </p>
      {((sponsors ?? []) as Sponsor[]).map((sponsor) => (
        <section className={cardClass} key={sponsor.id}>
          <div className="mb-4 flex items-center gap-4">
            {sponsor.logo_light_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={sponsor.name}
                className="w-auto object-contain"
                src={sponsor.logo_light_url}
                style={{ height: sponsor.display_height }}
              />
            ) : (
              <span className="text-sm text-muted-foreground">{t("noLogo")}</span>
            )}
          </div>
          <SponsorForm sponsor={sponsor} />
          <form action={deleteSponsorAction} className="mt-2">
            <input name="id" type="hidden" value={sponsor.id} />
            <ConfirmSubmit confirmLabel={t("remove")} title={t("removeTitle", { name: sponsor.name })}>
              {t("removeButton")}
            </ConfirmSubmit>
          </form>
        </section>
      ))}
      <section className={cardClass}>
        <h2 className="mb-3 font-display text-xl">{t("new")}</h2>
        <SponsorForm sponsor={null} />
      </section>
    </div>
    </div>
  );
}

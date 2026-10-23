import { getTranslations } from "next-intl/server";

import { CreateSpaceForm } from "@/components/app/create-space-form";

export default async function NewSpacePage() {
  const t = await getTranslations("newSpace");
  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-upv-500 dark:text-upv-300">{t("kicker")}</p>
      <h1 className="mt-2 font-heading text-3xl font-bold sm:text-4xl">{t("title")}</h1>
      <p className="mt-3 text-muted-foreground">
        {t("lead")}
      </p>
      <div className="mt-8 rounded-xl border border-border bg-white p-5 sm:p-7 dark:bg-card">
        <CreateSpaceForm />
      </div>
    </div>
  );
}

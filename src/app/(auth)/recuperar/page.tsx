import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { ResetRequestForm } from "@/components/auth/auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth"))("resetMeta") };
}

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const t = await getTranslations("auth");
  const { error } = await searchParams;
  return (
    <AuthCard description={error ? t("linkInvalid") : t("resetDescription")} title={t("resetTitle")}>
      <ResetRequestForm />
    </AuthCard>
  );
}

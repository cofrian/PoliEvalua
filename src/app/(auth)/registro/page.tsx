import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth"))("registerMeta") };
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslations("auth");
  return (
    <AuthCard
      description={t("registerDescription")}
      title={t("registerTitle")}
    >
      <RegisterForm inviteToken={params.invite} />
    </AuthCard>
  );
}

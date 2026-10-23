import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth"))("loginMeta") };
}

type LoginPageProps = {
  searchParams: Promise<{ reason?: string; invite?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const t = await getTranslations("auth");
  const notice =
    params.reason === "disabled"
      ? t("disabledNotice")
      : undefined;

  return (
    <AuthCard
      description={t("loginDescription")}
      title={t("loginTitle")}
    >
      <LoginForm inviteToken={params.invite} notice={notice} />
    </AuthCard>
  );
}

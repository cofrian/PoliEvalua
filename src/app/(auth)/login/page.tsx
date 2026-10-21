import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Entrar",
};

type LoginPageProps = {
  searchParams: Promise<{ reason?: string; invite?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const notice =
    params.reason === "disabled"
      ? "Cuenta desactivada, contacta con el admin."
      : undefined;

  return (
    <AuthCard
      description="Entra con tu cuenta para consultar, crear o administrar todos tus espacios."
      title="Entrar en Evalúa"
    >
      <LoginForm inviteToken={params.invite} notice={notice} />
    </AuthCard>
  );
}

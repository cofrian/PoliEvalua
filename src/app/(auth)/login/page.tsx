import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { AccessForm } from "@/components/auth/auth-forms";

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
      description="Introduce el código de tu espacio, tu correo y tu contraseña. En el primer acceso crearemos tu cuenta."
      title="Accede a tu espacio"
    >
      <AccessForm inviteToken={params.invite} notice={notice} />
    </AuthCard>
  );
}

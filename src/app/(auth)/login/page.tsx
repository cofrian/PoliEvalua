import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { AccessForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Entrar · València Hack",
};

type LoginPageProps = {
  searchParams: Promise<{ reason?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const notice =
    params.reason === "disabled"
      ? "Cuenta desactivada, contacta con el admin."
      : undefined;

  return (
    <AuthCard
      description="Entra con el código de la organización, tu correo y tu contraseña. En el primer acceso crearemos tu cuenta."
      title="Acceso del jurado"
    >
      <AccessForm notice={notice} />
    </AuthCard>
  );
}

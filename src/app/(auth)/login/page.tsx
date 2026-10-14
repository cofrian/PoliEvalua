import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Entrar · València Hack",
};

type LoginPageProps = {
  searchParams: Promise<{
    created?: string;
    error?: string;
    reason?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const notice =
    params.reason === "disabled"
      ? "Cuenta desactivada, contacta con el admin."
      : params.created === "1"
        ? "Cuenta creada. Ya puedes iniciar sesión."
        : params.error === "enlace-invalido"
          ? "El enlace no es válido o ha caducado. Solicita uno nuevo."
          : undefined;

  return (
    <AuthCard
      description="Accede a tus notas y evaluaciones desde cualquier dispositivo."
      title="Bienvenido de nuevo"
    >
      <LoginForm notice={notice} />
    </AuthCard>
  );
}

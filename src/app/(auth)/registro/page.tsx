import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Crear cuenta",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthCard
      description="Crea una única cuenta para participar en varios proyectos, asignaturas, premios o hackathones."
      title="Crear cuenta"
    >
      <RegisterForm inviteToken={params.invite} />
    </AuthCard>
  );
}

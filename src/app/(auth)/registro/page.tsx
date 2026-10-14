import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Crear cuenta · València Hack",
};

export default function RegisterPage() {
  return (
    <AuthCard
      description="Necesitas el código facilitado por la organización. Tu rol lo gestiona el equipo de València Hack."
      title="Crear una cuenta"
    >
      <RegisterForm />
    </AuthCard>
  );
}

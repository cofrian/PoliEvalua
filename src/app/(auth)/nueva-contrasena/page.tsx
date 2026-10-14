import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { NewPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Nueva contraseña · València Hack",
};

export default function NewPasswordPage() {
  return (
    <AuthCard
      description="Elige una contraseña nueva de al menos 8 caracteres."
      title="Nueva contraseña"
    >
      <NewPasswordForm />
    </AuthCard>
  );
}

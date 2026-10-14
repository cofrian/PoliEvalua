import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { RecoverForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Recuperar contraseña · València Hack",
};

export default function RecoverPage() {
  return (
    <AuthCard
      description="Te enviaremos un enlace seguro si el correo está registrado."
      title="Recuperar contraseña"
    >
      <RecoverForm />
    </AuthCard>
  );
}

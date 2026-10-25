import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { NewPasswordForm } from "@/components/auth/auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth"))("newMeta") };
}

// Solo se llega con sesión (el middleware manda al login si no la hay): la abre el enlace del correo.
export default async function NewPasswordPage() {
  const t = await getTranslations("auth");
  return (
    <AuthCard description={t("newDescription")} title={t("newTitle")}>
      <NewPasswordForm />
    </AuthCard>
  );
}

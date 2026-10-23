import { getTranslations } from "next-intl/server";

import { ProfileForm } from "@/components/app/profile-form";
import { getSession } from "@/lib/app/session";

export default async function ProfilePage() {
  const { user, profile } = await getSession();
  const [t, tRoles] = await Promise.all([getTranslations("profile"), getTranslations("roles")]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("role", { role: tRoles(profile.role) })}
        </p>
      </div>
      <ProfileForm
        avatarUrl={profile.avatar_url}
        email={user.email ?? ""}
        fullName={profile.full_name}
        locale={profile.locale}
        organization={profile.organization}
      />
    </div>
  );
}

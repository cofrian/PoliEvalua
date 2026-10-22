import { ProfileForm } from "@/components/app/profile-form";
import { getSession, roleLabels } from "@/lib/app/session";

export default async function ProfilePage() {
  const { user, profile } = await getSession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl tracking-tight sm:text-3xl">Perfil</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Rol: {roleLabels[profile.role]}
        </p>
      </div>
      <ProfileForm
        avatarUrl={profile.avatar_url}
        email={user.email ?? ""}
        fullName={profile.full_name}
        organization={profile.organization}
      />
    </div>
  );
}

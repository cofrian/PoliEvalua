import { getTranslations } from "next-intl/server";

import { AdminOverview } from "@/components/app/admin-overview";
import { SpaceCover } from "@/components/app/space-cover";
import { WelcomeGuide } from "@/components/app/welcome-guide";
import { getSession } from "@/lib/app/session";

export default async function AdminPage() {
  const session = await getSession();
  const [t, tKinds] = await Promise.all([getTranslations("adminHome"), getTranslations("spaceKinds")]);

  return (
    <div className="space-y-6">
      <SpaceCover
        color={session.branding.color}
        eyebrow={tKinds(session.event.kind)}
        logoUrl={session.branding.logoUrl}
        name={session.event.name}
        subtitle={t("description")}
      />
      <WelcomeGuide session={session} />
      <AdminOverview session={session} />
    </div>
  );
}

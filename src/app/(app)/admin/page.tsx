import { getTranslations } from "next-intl/server";

import { AdminOverview } from "@/components/app/admin-overview";
import { PageHeader } from "@/components/app/page-header";
import { getSession } from "@/lib/app/session";

export default async function AdminPage() {
  const session = await getSession();
  const t = await getTranslations("adminHome");

  return (
    <div className="space-y-6">
      <PageHeader
        description={t("description")}
        title={t("title")}
      />
      <AdminOverview session={session} />
    </div>
  );
}

import { AdminOverview } from "@/components/app/admin-overview";
import { PageHeader } from "@/components/app/page-header";
import { getSession } from "@/lib/app/session";

export default async function AdminPage() {
  const session = await getSession();

  return (
    <div className="space-y-6">
      <PageHeader
        description="Lo que falta por preparar y cómo va la evaluación, de un vistazo."
        title="Resumen"
      />
      <AdminOverview session={session} />
    </div>
  );
}

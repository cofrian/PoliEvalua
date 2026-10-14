import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/app/session";

const sections = [
  { href: "/admin", label: "Evento y usuarios" },
  { href: "/admin/equipos", label: "Equipos" },
  { href: "/admin/retos", label: "Retos" },
  { href: "/admin/patrocinadores", label: "Patrocinadores" },
  { href: "/admin/auditoria", label: "Auditoría" },
];

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { isAdmin } = await getSession();
  if (!isAdmin) redirect("/equipos");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl">Admin</h1>
        <nav className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
          {sections.map((section) => (
            <Link
              className="rounded-full border border-line px-3 py-1.5 hover:bg-navy-900/5 dark:border-[#262838] dark:hover:bg-white/10"
              href={section.href}
              key={section.href}
            >
              {section.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}

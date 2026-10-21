import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/app/session";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { isAdmin, event, words } = await getSession();
  if (!isAdmin) redirect("/equipos");

  const academic = event.kind === "class" || event.kind === "project";
  const sections = [
    { href: "/admin", label: "Espacio y personas" },
    { href: "/admin/asistente", label: "Asistente" },
    ...(words.hasModule("rubric") ? [{ href: "/admin/evaluacion", label: "Evaluación" }] : []),
    { href: "/admin/paneles", label: `Paneles de ${words.evaluator}` },
    { href: "/admin/agenda", label: "Agenda" },
    { href: "/admin/grabaciones", label: "Grabaciones" },
    ...(academic ? [{ href: "/admin/academico", label: "Datos académicos" }] : []),
    ...(words.hasModule("participants") ? [{ href: "/admin/equipos", label: words.units }] : []),
    ...(words.showChallenges ? [{ href: "/admin/retos", label: "Retos" }] : []),
    ...(words.hasModule("sponsors") ? [{ href: "/admin/patrocinadores", label: "Patrocinadores" }] : []),
    { href: "/admin/auditoria", label: "Auditoría" },
  ];

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

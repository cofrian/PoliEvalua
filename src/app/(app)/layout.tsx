import Image from "next/image";
import Link from "next/link";

import { logoutAction } from "@/app/(auth)/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSession, roleLabels } from "@/lib/app/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { profile, isAdmin } = await getSession();

  const links = [
    { href: "/equipos", label: "Equipos" },
    ...(isAdmin
      ? [
          { href: "/resultados", label: "Resultados" },
          { href: "/admin", label: "Admin" },
        ]
      : []),
  ];

  return (
    <div className="min-h-svh bg-paper-50 text-navy-900 dark:bg-ink-950 dark:text-[#F4F1EA]">
      <header className="sticky top-0 z-30 border-b border-line bg-paper-50/90 backdrop-blur dark:border-[#262838] dark:bg-ink-950/90">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/equipos">
              <Image
                alt="València Hack"
                className="h-9 w-auto"
                height={72}
                priority
                src="/brand/valencia-hack.svg"
                width={180}
              />
            </Link>
            <nav className="flex gap-1 text-sm font-semibold">
              {links.map((link) => (
                <Link
                  className="rounded-md px-2.5 py-1.5 hover:bg-navy-900/5 dark:hover:bg-white/10"
                  href={link.href}
                  key={link.href}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm font-medium sm:inline">
              {profile.full_name}
            </span>
            <Badge variant="secondary">{roleLabels[profile.role]}</Badge>
            <ThemeToggle />
            <form action={logoutAction}>
              <Button className="h-9" type="submit" variant="outline">
                Salir
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}

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
  const { supabase, profile, isAdmin, eventClosed } = await getSession();

  // Última actividad (para el panel admin). No bloquea si falla.
  await supabase.rpc("touch_last_seen");

  const links = [
    { href: "/equipos", label: "Equipos" },
    { href: "/rubrica", label: "Rúbrica" },
    ...(isAdmin || eventClosed ? [{ href: "/resultados", label: "Resultados" }] : []),
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <div className="min-h-svh bg-paper-50 text-navy-900 dark:bg-ink-950 dark:text-[#F4F1EA]">
      <header className="sticky top-0 z-30 border-b border-line bg-paper-50/90 backdrop-blur print:hidden dark:border-[#262838] dark:bg-ink-950/90">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pt-3 sm:px-6 sm:py-3">
          <div className="flex min-w-0 items-center gap-4">
            <Link className="shrink-0" href="/equipos">
              <Image
                alt="València Hack"
                className="h-9 w-auto"
                height={72}
                priority
                src="/brand/valencia-hack.svg"
                width={180}
              />
            </Link>
            <nav className="hidden gap-1 text-sm font-semibold sm:flex">
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
            <Link
              className="flex items-center gap-2 rounded-full py-1 pr-1 hover:bg-navy-900/5 dark:hover:bg-white/10"
              href="/perfil"
              title="Mi perfil"
            >
              <span className="hidden text-sm font-medium md:inline">
                {profile.full_name}
              </span>
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt="Mi perfil"
                  className="size-8 rounded-full object-cover"
                  src={profile.avatar_url}
                />
              ) : (
                <span className="flex size-8 items-center justify-center rounded-full bg-sky-400 text-xs font-bold text-white">
                  {profile.full_name.slice(0, 1).toUpperCase()}
                </span>
              )}
            </Link>
            <Badge className="hidden sm:inline-flex" variant="secondary">
              {roleLabels[profile.role]}
            </Badge>
            <ThemeToggle />
            <form action={logoutAction}>
              <Button className="h-9" type="submit" variant="outline">
                Salir
              </Button>
            </form>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 py-2 text-sm font-semibold sm:hidden">
          {links.map((link) => (
            <Link
              className="shrink-0 rounded-md px-2.5 py-1.5 hover:bg-navy-900/5 dark:hover:bg-white/10"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}

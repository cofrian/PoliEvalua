import Link from "next/link";

import { logoutAction } from "@/app/(auth)/actions";
import { UpvBrand } from "@/components/brand/upv-brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getAccount } from "@/lib/app/session";

export default async function PlatformLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { supabase, profile } = await getAccount();
  await supabase.rpc("touch_last_seen");

  return (
    <div className="min-h-svh bg-muted text-upv-ink dark:bg-ink-950 dark:text-upv-100">
      <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur dark:bg-[#1B1E1E]/95">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <UpvBrand href="/espacios" />
          <div className="flex items-center gap-2">
            <span className="hidden text-sm font-medium sm:inline">{profile.full_name}</span>
            <ThemeToggle />
            <form action={logoutAction}>
              <Button className="h-9" type="submit" variant="outline">Salir</Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      <footer className="mx-auto flex w-full max-w-7xl justify-center px-4 py-8 text-xs text-muted-foreground sm:px-6 lg:px-8">
        <Link className="hover:text-foreground" href="/">Evalúa · Universitat Politècnica de València</Link>
      </footer>
    </div>
  );
}

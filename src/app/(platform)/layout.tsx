import Link from "next/link";

import { UserMenu } from "@/components/app/app-shell";
import { UpvBrand } from "@/components/brand/upv-brand";
import { getAccount } from "@/lib/app/session";

export default async function PlatformLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { supabase, profile } = await getAccount();
  await supabase.rpc("touch_last_seen");

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <UpvBrand compact href="/espacios" />
          <UserMenu
            profile={{ name: profile.full_name || "Tu cuenta", avatarUrl: profile.avatar_url ?? null, roleLabel: "Tus espacios" }}
          />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      <footer className="mx-auto flex w-full max-w-6xl justify-center px-4 py-8 text-xs text-muted-foreground sm:px-6 lg:px-8">
        <Link className="hover:text-foreground" href="/">Evalúa · Universitat Politècnica de València</Link>
      </footer>
    </div>
  );
}

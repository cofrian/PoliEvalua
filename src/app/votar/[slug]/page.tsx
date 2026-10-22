import { createHash } from "node:crypto";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { PublicVoteForm } from "@/components/app/public-vote-form";
import { UpvBrand } from "@/components/brand/upv-brand";
import { publicVoteSettings } from "@/lib/app/public-vote";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Votación del público", robots: { index: false } };

/** Página pública (sin cuenta) a la que lleva el QR del proyector. */
export default async function PublicVotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: event } = await admin.from("events").select("id, name, settings").eq("slug", slug).maybeSingle();
  if (!event) notFound();
  const settings = publicVoteSettings(event.settings);

  const [{ data: teams }, cookieStore] = await Promise.all([
    admin.from("teams").select("id, number, name, project_title").eq("event_id", event.id).order("number"),
    cookies(),
  ]);
  const token = cookieStore.get(`pv_${event.id.slice(0, 8)}`)?.value;
  const { data: current } = token
    ? await admin
        .from("public_votes")
        .select("team_id")
        .eq("event_id", event.id)
        .eq("voter_hash", createHash("sha256").update(`${event.id}:${token}`).digest("hex"))
        .maybeSingle()
    : { data: null };

  return (
    <main className="mx-auto min-h-svh max-w-xl bg-background px-4 py-6 text-upv-ink dark:bg-ink-950 dark:text-upv-100">
      <UpvBrand className="mb-6" href="/" />
      <p className="text-sm font-semibold text-muted-foreground">{event.name}</p>
      <h1 className="font-display text-3xl">{settings.title}</h1>
      {settings.open ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Elige tu proyecto favorito. Un voto por dispositivo; puedes cambiarlo mientras la votación siga abierta.
          </p>
          <PublicVoteForm currentTeamId={current?.team_id ?? null} slug={slug} teams={teams ?? []} />
        </>
      ) : (
        <p className="mt-6 rounded-xl border border-border bg-white p-6 text-center dark:bg-card">
          La votación está cerrada en este momento.
        </p>
      )}
    </main>
  );
}

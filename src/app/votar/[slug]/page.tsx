import { createHash } from "node:crypto";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";

import { PublicScoreForm } from "@/components/app/public-score-form";
import { PublicVoteForm } from "@/components/app/public-vote-form";
import { LocaleSwitcher } from "@/components/app/locale-switcher";
import { PoliBrand } from "@/components/brand/poli-brand";
import { publicVoteSettings } from "@/lib/app/public-vote";
import { publicRubric } from "@/lib/app/public-vote-data";
import { pickClientMessages } from "@/i18n/client-messages";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("publicVote");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Página pública (sin cuenta) a la que lleva el QR del proyector. */
export default async function PublicVotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: event } = await admin.from("events").select("id, name, settings, locale").eq("slug", slug).maybeSingle();
  if (!event) notFound();
  const settings = publicVoteSettings(event.settings);

  const [{ data: teams }, cookieStore] = await Promise.all([
    admin.from("teams").select("id, number, name, project_title").eq("event_id", event.id).order("number"),
    cookies(),
  ]);
  // Sin idioma elegido, el público ve el del espacio y no el de su navegador.
  const chosen = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(chosen) ? chosen : isLocale(event.locale) ? event.locale : "es";
  const [t, messages] = await Promise.all([
    getTranslations({ locale, namespace: "publicVote" }),
    getMessages({ locale }),
  ]);
  const token = cookieStore.get(`pv_${event.id.slice(0, 8)}`)?.value;
  const voterHash = token ? createHash("sha256").update(`${event.id}:${token}`).digest("hex") : null;
  const rubricMode = settings.mode === "rubric";
  const [{ data: current }, rubric, { data: myScores }] = await Promise.all([
    voterHash && !rubricMode
      ? admin.from("public_votes").select("team_id").eq("event_id", event.id).eq("voter_hash", voterHash).maybeSingle()
      : Promise.resolve({ data: null }),
    rubricMode ? publicRubric(admin, event.id) : Promise.resolve(null),
    voterHash && rubricMode
      ? admin.from("public_scores").select("team_id, criterion_id, score").eq("event_id", event.id).eq("voter_hash", voterHash)
      : Promise.resolve({ data: [] as { team_id: string; criterion_id: string; score: number }[] }),
  ]);
  // Lo que este dispositivo ya puntuó, para poder corregirlo.
  const saved: Record<string, Record<string, number>> = {};
  for (const row of myScores ?? []) (saved[row.team_id] ??= {})[row.criterion_id] = Number(row.score);

  return (
    <NextIntlClientProvider locale={locale} messages={pickClientMessages(messages)}>
    <main lang={locale} className="mx-auto min-h-svh max-w-xl bg-background px-4 py-6 text-upv-ink dark:bg-ink-950 dark:text-upv-100">
      <div className="mb-6 flex items-center justify-between gap-3">
        <PoliBrand href="/" />
        <LocaleSwitcher />
      </div>
      <p className="text-sm font-semibold text-muted-foreground">{event.name}</p>
      <h1 className="font-display text-3xl">{settings.title ?? t("defaultTitle")}</h1>
      {settings.open ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            {rubricMode ? t("introRubric") : t("intro")}
          </p>
          {rubricMode ? (
            rubric ? (
              <PublicScoreForm locale={locale} rubric={rubric} saved={saved} slug={slug} teams={teams ?? []} />
            ) : (
              <p className="mt-6 rounded-xl border border-border bg-white p-6 text-center dark:bg-card">{t("noRubric")}</p>
            )
          ) : (
            <PublicVoteForm locale={locale} currentTeamId={current?.team_id ?? null} slug={slug} teams={teams ?? []} />
          )}
        </>
      ) : (
        <p className="mt-6 rounded-xl border border-border bg-white p-6 text-center dark:bg-card">
          {t("closed")}
        </p>
      )}
    </main>
    </NextIntlClientProvider>
  );
}

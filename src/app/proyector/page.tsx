import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AutoRefresh } from "@/components/app/auto-refresh";
import { UpvBrand } from "@/components/brand/upv-brand";
import { byRoom, scheduleRoom, timeFormat } from "@/lib/app/agenda";
import { loadAgenda } from "@/lib/app/agenda-data";
import { publicVoteSettings } from "@/lib/app/public-vote";
import { publicVoteCounts, publicVoteUrl, qrSvg } from "@/lib/app/public-vote-data";
import { getSession } from "@/lib/app/session";
import { vocabulary } from "@/lib/app/vocabulary";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("projector"))("meta") };
}

/**
 * Pantalla para proyectar en la sala: quién expone ahora y quién va después en
 * cada sala, el QR para votar y, si se activa, el recuento en directo.
 */
export default async function ProjectorPage() {
  const { supabase, event, isAdmin } = await getSession();
  if (!isAdmin) redirect("/agenda");
  // Lo ve el público de la sala: va en el idioma del espacio, no en el de quien lo abre.
  const [t, tVote] = await Promise.all([
    getTranslations({ locale: event.locale, namespace: "projector" }),
    getTranslations({ locale: event.locale, namespace: "publicVote" }),
  ]);
  const words = vocabulary(event, event.locale);

  const vote = publicVoteSettings(event.settings);
  const [agenda, url] = await Promise.all([loadAgenda(supabase, event.id), publicVoteUrl(event.slug)]);
  const [svg, counts] = await Promise.all([
    vote.open ? qrSvg(url) : Promise.resolve(null),
    vote.open && vote.showResults ? publicVoteCounts(supabase, event.id) : Promise.resolve(null),
  ]);
  const rooms = byRoom(agenda).map(([room, slots]) => {
    const scheduled = scheduleRoom(slots);
    return {
      room,
      live: scheduled.find((slot) => slot.status === "live") ?? null,
      next: scheduled.filter((slot) => slot.status === "pending").slice(0, 2),
    };
  });
  const top = counts?.teams.slice(0, 8) ?? [];
  const max = Math.max(1, ...top.map((team) => team.votes));

  return (
    <main className="min-h-svh bg-ink-950 p-8 text-white" lang={event.locale}>
      <AutoRefresh seconds={5} />
      <header className="mb-10 flex items-center justify-between gap-6">
        <UpvBrand className="[&_*]:text-white" href="/admin" />
        <p className="font-display text-3xl">{event.name}</p>
      </header>

      <div className={`grid gap-10 ${svg ? "lg:grid-cols-[2fr_1fr]" : ""}`}>
        <section className="space-y-8">
          {rooms.length ? (
            rooms.map(({ room, live, next }) => (
              <div className="space-y-3" key={room}>
                <p className="text-xl font-semibold uppercase tracking-[0.15em] text-white/60">{room}</p>
                {live ? (
                  <div className="rounded-2xl border-2 border-red-500 bg-red-500/10 p-6">
                    <p className="flex items-center gap-2 text-lg font-bold text-red-400">
                      <span aria-hidden="true" className="size-3 animate-pulse rounded-full bg-red-500" /> {t("live")}
                    </p>
                    <p className="mt-2 font-display text-5xl">
                      {words.unit} #{live.team.number} · {live.team.name}
                    </p>
                  </div>
                ) : (
                  <p className="text-2xl text-white/60">{t("nobody")}</p>
                )}
                {next.length ? (
                  <ul className="space-y-1 text-2xl text-white/80">
                    {next.map((slot) => (
                      <li key={slot.id}>
                        <span className="font-mono text-white/60">
                          {slot.expectedStart ? timeFormat.format(slot.expectedStart) : "—"}
                        </span>{" "}
                        {slot.team.name}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-3xl text-white/60">{t("noAgenda")}</p>
          )}
        </section>

        {svg ? (
          <aside className="space-y-6">
            <div className="rounded-2xl bg-white p-6 text-center text-ink-950">
              <p className="font-display text-3xl">{vote.title ?? tVote("defaultTitle")}</p>
              <div
                aria-label={t("qr", { url })}
                className="mx-auto mt-4 aspect-square w-full max-w-xs [&_svg]:size-full"
                dangerouslySetInnerHTML={{ __html: svg }}
                role="img"
              />
              <p className="mt-2 break-all font-mono text-sm">{url.replace(/^https?:\/\//, "")}</p>
            </div>
            {counts ? (
              <ol className="space-y-2">
                {top.map((team) => (
                  <li className="flex items-center gap-3 text-lg" key={team.id}>
                    <span className="w-44 truncate">{team.name}</span>
                    <span className="h-4 flex-1 overflow-hidden rounded-full bg-white/10">
                      <span className="block h-full rounded-full bg-yellow-400" style={{ width: `${(team.votes / max) * 100}%` }} />
                    </span>
                    <span className="w-10 text-right font-mono">{team.votes}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </aside>
        ) : null}
      </div>
    </main>
  );
}

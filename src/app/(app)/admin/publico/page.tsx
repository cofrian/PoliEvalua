import { MonitorPlay } from "lucide-react";
import Link from "next/link";

import { resetPublicVotesAction, updatePublicVoteAction } from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { publicVoteSettings } from "@/lib/app/public-vote";
import { publicVoteCounts, publicVoteUrl, qrSvg } from "@/lib/app/public-vote-data";
import { getSession } from "@/lib/app/session";
import { cardClass } from "@/lib/app/ui";

export default async function PublicAdminPage() {
  const { supabase, event } = await getSession();
  const settings = publicVoteSettings(event.settings);
  const url = await publicVoteUrl(event.slug);
  const [svg, counts] = await Promise.all([qrSvg(url), publicVoteCounts(supabase, event.id)]);

  return (
    <div className="space-y-8">
      <section className={cardClass}>
        <h2 className="mb-2 font-display text-2xl">Voto del público</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Cualquiera con el enlace o el QR vota sin crear cuenta: un voto por dispositivo, que puede cambiar mientras
          esté abierta. Es independiente de la evaluación del jurado.
        </p>
        <form action={updatePublicVoteAction} className="space-y-4">
          <label className="block space-y-1 text-sm font-semibold">
            <span className="block">Título</span>
            <Input defaultValue={settings.title} maxLength={120} name="title" />
          </label>
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input defaultChecked={settings.open} name="open" type="checkbox" />
            Votación abierta
          </label>
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input defaultChecked={settings.showResults} name="showResults" type="checkbox" />
            Mostrar el recuento en la pantalla del proyector
          </label>
          <Button type="submit">Guardar</Button>
        </form>
      </section>

      <section className={`${cardClass} grid gap-6 sm:grid-cols-[200px_1fr]`}>
        <div
          aria-label={`Código QR para votar: ${url}`}
          className="aspect-square w-full max-w-[200px] rounded-lg bg-white p-2 [&_svg]:size-full"
          dangerouslySetInnerHTML={{ __html: svg }}
          role="img"
        />
        <div className="space-y-3">
          <p className="break-all font-mono text-sm">{url}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/proyector" target="_blank">
                <MonitorPlay className="size-4" /> Abrir pantalla del proyector
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href={url} rel="noopener noreferrer" target="_blank">Probar la votación</a>
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Recuento ({counts.total})</h2>
          {counts.total ? (
            <form action={resetPublicVotesAction}>
              <Button className="h-9 text-destructive" type="submit" variant="ghost">
                Borrar todos los votos
              </Button>
            </form>
          ) : null}
        </div>
        <ol className="space-y-2">
          {counts.teams.map((team) => (
            <li className="flex items-center gap-3 text-sm" key={team.id}>
              <span className="w-40 truncate font-semibold sm:w-60">#{team.number} · {team.name}</span>
              <span className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${counts.total ? (team.votes / counts.total) * 100 : 0}%` }}
                />
              </span>
              <span className="w-10 text-right font-mono">{team.votes}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

import { MonitorPlay } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import Link from "next/link";

import { resetPublicVotesAction, updatePublicVoteAction } from "@/app/(app)/admin/actions";
import { SettingRow, SettingSwitch, SettingsForm } from "@/components/app/settings-form";
import { ConfirmSubmit } from "@/components/app/confirm-submit";
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
    <div className="space-y-6">
      <PageHeader
        description="Un QR para que el público vote y una pantalla con el recuento en directo."
        title="Voto del público"
      />
      <SettingsForm
        action={updatePublicVoteAction}
        description="Cualquiera con el enlace o el QR vota sin crear cuenta: un voto por dispositivo, que puede cambiar mientras esté abierta. No cuenta en la evaluación del jurado."
        title="Votación"
      >
        <SettingRow htmlFor="title" label="Título" description="Lo que verá el público al abrir el enlace.">
          <Input defaultValue={settings.title} id="title" maxLength={120} name="title" />
        </SettingRow>
        <SettingRow htmlFor="open" label="Votación abierta" description="Mientras esté cerrada, el enlace solo muestra un aviso.">
          <SettingSwitch defaultChecked={settings.open} id="open" name="open" />
        </SettingRow>
        <SettingRow htmlFor="showResults" label="Mostrar el recuento en el proyector" description="Si no, la pantalla solo muestra el QR.">
          <SettingSwitch defaultChecked={settings.showResults} id="showResults" name="showResults" />
        </SettingRow>
      </SettingsForm>

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

      <section className={`${cardClass} space-y-3`}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Recuento ({counts.total})</h2>
          {counts.total ? (
            <form action={resetPublicVotesAction}>
              <ConfirmSubmit
                confirmLabel="Borrar votos"
                description={`Se eliminan los ${counts.total} votos del público. No se puede deshacer.`}
                title="¿Borrar todos los votos?"
              >
                Borrar todos los votos
              </ConfirmSubmit>
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

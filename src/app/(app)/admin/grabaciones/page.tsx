import { updateRecordingSettingsAction } from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_RECORDING_NOTICE, NO_AUDIO_GUARANTEE } from "@/lib/app/recording-notice";
import { getSession, roleLabels, type SpaceRole } from "@/lib/app/session";
import { cardClass } from "@/lib/app/ui";

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function RecordingSettingsPage() {
  const { supabase, event, recording } = await getSession();
  const { data: members } = await supabase
    .from("event_members")
    .select(
      "user_id, role, recording_notice_version, recording_notice_ack_at, profile:profiles!event_members_user_id_fkey(full_name)",
    )
    .eq("event_id", event.id)
    .eq("status", "active")
    .order("joined_at");

  const rows = (members ?? []).map((member) => {
    const relation = member.profile as unknown as { full_name: string } | { full_name: string }[] | null;
    const profile = Array.isArray(relation) ? relation[0] : relation;
    return {
      id: member.user_id,
      name: profile?.full_name || "(sin nombre)",
      role: member.role as SpaceRole,
      acknowledged: (member.recording_notice_version ?? -1) >= recording.noticeVersion,
      at: member.recording_notice_ack_at,
    };
  });
  const pending = rows.filter((row) => !row.acknowledged).length;

  return (
    <div className="space-y-8">
      <section className={cardClass}>
        <h2 className="mb-2 font-display text-2xl">Grabación de exposiciones</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Al activarla, cada persona que entre en el espacio verá el aviso y tendrá que confirmarlo antes de continuar.
          Si cambias el texto, todos lo volverán a ver.
        </p>
        <form action={updateRecordingSettingsAction} className="space-y-5">
          <label className="flex items-center gap-3 rounded-lg border border-input p-3 text-sm font-semibold">
            <input defaultChecked={recording.enabled} name="enabled" type="checkbox" />
            Grabar exposiciones en este espacio
          </label>
          <div className="space-y-2">
            <label className="block text-sm font-semibold" htmlFor="noticeText">
              Texto del aviso (opcional)
            </label>
            <Textarea
              defaultValue={recording.customText ?? ""}
              id="noticeText"
              maxLength={2000}
              name="noticeText"
              placeholder={DEFAULT_RECORDING_NOTICE}
              rows={5}
            />
            <p className="text-xs text-muted-foreground">
              Déjalo vacío para usar el texto por defecto. Si lo personalizas, siempre se añadirá: «{NO_AUDIO_GUARANTEE}»
            </p>
          </div>
          <Button type="submit">Guardar</Button>
        </form>
      </section>

      {recording.enabled ? (
        <section>
          <h2 className="mb-3 font-display text-2xl">
            Confirmaciones ({rows.length - pending}/{rows.length})
          </h2>
          <div className="overflow-x-auto rounded-xl border border-line bg-white dark:border-[#262838] dark:bg-[#151621]">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs uppercase text-muted-foreground dark:border-[#262838]">
                <tr>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Rol</th>
                  <th className="px-3 py-2 text-right">Aviso</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-b border-line last:border-0 dark:border-[#262838]" key={row.id}>
                    <td className="px-3 py-2 font-semibold">{row.name}</td>
                    <td className="px-3 py-2">{roleLabels[row.role]}</td>
                    <td className="px-3 py-2 text-right">
                      {row.acknowledged && row.at
                        ? `Confirmado · ${dateFormat.format(new Date(row.at))}`
                        : "Pendiente"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

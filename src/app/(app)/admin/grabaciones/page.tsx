import { updateRecordingSettingsAction } from "@/app/(app)/admin/actions";
import { PageHeader } from "@/components/app/page-header";
import { SettingRow, SettingSwitch, SettingsForm } from "@/components/app/settings-form";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_RECORDING_NOTICE, NO_AUDIO_GUARANTEE } from "@/lib/app/recording-notice";
import { getSession, roleLabels, type SpaceRole } from "@/lib/app/session";
import { selectClass } from "@/lib/app/ui";

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
    <div className="space-y-6">
      <PageHeader
        description="Transcripción y análisis de cada exposición. El audio nunca se guarda."
        title="Grabaciones"
      />
      <SettingsForm
        action={updateRecordingSettingsAction}
        description="Al activarla, cada persona que entre verá el aviso y tendrá que confirmarlo. Si cambias el texto, todos lo volverán a ver."
        title="Grabación de exposiciones"
      >
        <SettingRow htmlFor="enabled" label="Grabar exposiciones en este espacio">
          <SettingSwitch defaultChecked={recording.enabled} id="enabled" name="enabled" />
        </SettingRow>
        <SettingRow
          description="Con «Detectar automáticamente» cada exposición puede ser en castellano, valenciano o inglés. Fija un idioma solo si todas son en el mismo: la transcripción es algo más precisa."
          htmlFor="spokenLanguage"
          label="Idioma de las exposiciones"
        >
          <select
            className={`${selectClass} w-full`}
            defaultValue={recording.spokenLanguage}
            id="spokenLanguage"
            name="spokenLanguage"
          >
            <option value="auto">Detectar automáticamente</option>
            <option value="es">Castellano</option>
            <option value="ca">Valenciano</option>
            <option value="en">Inglés</option>
          </select>
        </SettingRow>
        <SettingRow
          description={`Déjalo vacío para usar el texto por defecto. Si lo personalizas, siempre se añadirá: «${NO_AUDIO_GUARANTEE}»`}
          htmlFor="noticeText"
          label="Texto del aviso (opcional)"
          stacked
        >
          <Textarea
            defaultValue={recording.customText ?? ""}
            id="noticeText"
            maxLength={2000}
            name="noticeText"
            placeholder={DEFAULT_RECORDING_NOTICE}
            rows={5}
          />
        </SettingRow>
      </SettingsForm>

      {recording.enabled ? (
        <section>
          <h2 className="mb-3 font-display text-lg">
            Confirmaciones ({rows.length - pending}/{rows.length})
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Rol</th>
                  <th className="px-3 py-2 text-right">Aviso</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-b border-border last:border-0" key={row.id}>
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

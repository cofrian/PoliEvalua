import { getFormatter, getTranslations } from "next-intl/server";

import { updateAiSettingsAction, updateRecordingSettingsAction } from "@/app/(app)/admin/actions";
import { PageHeader } from "@/components/app/page-header";
import { SettingRow, SettingSwitch, SettingsForm } from "@/components/app/settings-form";
import { Textarea } from "@/components/ui/textarea";
import { INSTRUCTIONS_MAX } from "@/lib/ai/prompts/presentation";
import { RETENTION_OPTIONS } from "@/lib/app/recording-notice";
import { getSession, type SpaceRole } from "@/lib/app/session";
import { selectClass } from "@/lib/app/ui";

export default async function RecordingSettingsPage() {
  const { supabase, event, recording } = await getSession();
  const [t, tRoles, tNotice, format] = await Promise.all([
    getTranslations("recordingsAdmin"),
    getTranslations("roles"),
    getTranslations("recordingNotice"),
    getFormatter(),
  ]);
  const tSettings = await getTranslations("settings");
  const ai = ((event.settings ?? {}) as { ai?: { instructions?: string | null } }).ai;
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
      name: profile?.full_name || t("noName"),
      role: member.role as SpaceRole,
      acknowledged: (member.recording_notice_version ?? -1) >= recording.noticeVersion,
      at: member.recording_notice_ack_at,
    };
  });
  const pending = rows.filter((row) => !row.acknowledged).length;

  return (
    <div className="space-y-6">
      <PageHeader
        description={t("pageDescription")}
        title={t("pageTitle")}
      />
      <SettingsForm
        action={updateRecordingSettingsAction}
        description={t("formDescription")}
        title={t("formTitle")}
      >
        <SettingRow htmlFor="enabled" label={t("enabled")}>
          <SettingSwitch defaultChecked={recording.enabled} id="enabled" name="enabled" />
        </SettingRow>
        <SettingRow
          description={t("languageHint")}
          htmlFor="spokenLanguage"
          label={t("language")}
        >
          <select
            className={`${selectClass} w-full`}
            defaultValue={recording.spokenLanguage}
            id="spokenLanguage"
            name="spokenLanguage"
          >
            {(["auto", "es", "ca", "en"] as const).map((value) => (
              <option key={value} value={value}>
                {t(`languages.${value}`)}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow description={t("retentionHint")} htmlFor="retentionMonths" label={t("retention")}>
          <select
            className={`${selectClass} w-full`}
            defaultValue={recording.retentionMonths}
            id="retentionMonths"
            name="retentionMonths"
          >
            {[...new Set([...RETENTION_OPTIONS, recording.retentionMonths])]
              .sort((a, b) => a - b)
              .map((value) => (
                <option key={value} value={value}>
                  {t("retentionMonths", { count: value })}
                </option>
              ))}
          </select>
        </SettingRow>
        <SettingRow
          description={t("noticeHint", { guarantee: tNotice("guarantee") })}
          htmlFor="noticeText"
          label={t("noticeLabel")}
          stacked
        >
          <Textarea
            defaultValue={recording.customText ?? ""}
            id="noticeText"
            maxLength={2000}
            name="noticeText"
            placeholder={tNotice("default", { months: recording.retentionMonths })}
            rows={5}
          />
        </SettingRow>
      </SettingsForm>

      <SettingsForm
        action={updateAiSettingsAction}
        description={tSettings("aiDescription")}
        title={tSettings("ai")}
      >
        <SettingRow
          description={tSettings("aiHint")}
          htmlFor="aiInstructions"
          label={tSettings("aiLabel", { max: INSTRUCTIONS_MAX })}
          stacked
        >
          <Textarea
            defaultValue={ai?.instructions ?? ""}
            id="aiInstructions"
            maxLength={INSTRUCTIONS_MAX}
            name="aiInstructions"
            placeholder={tSettings("aiPlaceholder")}
            rows={3}
          />
        </SettingRow>
      </SettingsForm>

      {recording.enabled ? (
        <section>
          <h2 className="mb-3 font-display text-lg">
            {t("confirmations", { done: rows.length - pending, total: rows.length })}
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t("name")}</th>
                  <th className="px-3 py-2">{t("role")}</th>
                  <th className="px-3 py-2 text-right">{t("notice")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-b border-border last:border-0" key={row.id}>
                    <td className="px-3 py-2 font-semibold">{row.name}</td>
                    <td className="px-3 py-2">{tRoles(row.role)}</td>
                    <td className="px-3 py-2 text-right">
                      {row.acknowledged && row.at
                        ? t("confirmedAt", { date: format.dateTime(new Date(row.at), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) })
                        : t("pending")}
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

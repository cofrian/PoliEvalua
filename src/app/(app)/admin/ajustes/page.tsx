import {
  updateEventAction,
  updateMaterialsSettingsAction,
  updateStudentVisibilityAction,
} from "@/app/(app)/admin/actions";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/app/page-header";
import { AdvancedSettings, SettingRow, SettingSwitch, SettingsForm } from "@/components/app/settings-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LOCALES, localeNames } from "@/i18n/config";
import { getSession } from "@/lib/app/session";
import { selectClass } from "@/lib/app/ui";

export default async function AdminSettingsPage() {
  const { supabase, event, words } = await getSession();
  const statusLabels = words.stageLabels;
  const [tLocale, t, tNav] = await Promise.all([
    getTranslations("locale"),
    getTranslations("settings"),
    getTranslations("nav"),
  ]);
  const enabledRoles = ((event.settings ?? {}) as { enabled_roles?: string[] }).enabled_roles ?? [];

  const { data: eventSettings } = await supabase
    .from("events")
    .select("id, name, status, signup_code, signup_open, locale")
    .eq("id", event.id)
    .single();

  return (
    <div className="space-y-6">
      <PageHeader
        description={t("pageDescription")}
        title={t("pageTitle")}
      />
      {eventSettings ? (
        <SettingsForm
          action={updateEventAction}
          description={t("generalDescription")}
          title={t("general")}
        >
          <input name="id" type="hidden" value={eventSettings.id} />
          <SettingRow htmlFor="name" label={t("name")}>
            <Input defaultValue={eventSettings.name} id="name" name="name" />
          </SettingRow>
          <SettingRow description={tLocale("spaceHint")} htmlFor="locale" label={tLocale("spaceLabel")}>
            <select className={`${selectClass} w-full`} defaultValue={eventSettings.locale} id="locale" name="locale">
              {LOCALES.map((value) => (
                <option key={value} lang={value} value={value}>
                  {localeNames[value]}
                </option>
              ))}
            </select>
          </SettingRow>
          <SettingRow
            description={t("phaseHint")}
            htmlFor="status"
            label={t("phase")}
          >
            <select className={`${selectClass} w-full`} defaultValue={eventSettings.status} id="status" name="status">
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </SettingRow>
          <AdvancedSettings hint={t("advancedHint")}>
            <SettingRow
              description={t("codeHint")}
              htmlFor="signupCode"
              label={t("code")}
            >
              <Input
                className="font-mono uppercase"
                defaultValue={eventSettings.signup_code}
                id="signupCode"
                name="signupCode"
              />
            </SettingRow>
            <SettingRow
              description={t("codeOpenHint")}
              htmlFor="signupOpen"
              label={t("codeOpen")}
            >
              <SettingSwitch defaultChecked={eventSettings.signup_open} id="signupOpen" name="signupOpen" />
            </SettingRow>
          </AdvancedSettings>
        </SettingsForm>
      ) : null}

      {enabledRoles.includes("student") ? (
        <SettingsForm
          action={updateStudentVisibilityAction}
          description={t("studentsDescription", { myUnit: tNav("myUnit", { mode: words.mode }) })}
          title={t("students")}
        >
          <SettingRow
            description={t("showRubricHint", { presentation: words.presentation })}
            htmlFor="showRubric"
            label={t("showRubric")}
          >
            <SettingSwitch defaultChecked={words.studentsSeeRubric} id="showRubric" name="showRubric" />
          </SettingRow>
          <SettingRow
            description={t("publishHint", { unit: words.unitLower })}
            htmlFor="publishResults"
            label={t("publish")}
          >
            <SettingSwitch defaultChecked={words.resultsPublished} id="publishResults" name="publishResults" />
          </SettingRow>
        </SettingsForm>
      ) : null}

      <SettingsForm
        action={updateMaterialsSettingsAction}
        description={t("materialsDescription", { unit: words.unitLower })}
        title={t("materials")}
      >
        <SettingRow
          description={t("driveHint")}
          htmlFor="driveUrl"
          label={t("drive")}
          stacked
        >
          <Input
            defaultValue={words.materials.driveUrl ?? ""}
            id="driveUrl"
            inputMode="url"
            name="driveUrl"
            placeholder="https://drive.google.com/drive/folders/…"
          />
        </SettingRow>
        <SettingRow
          description={t("instructionsHint")}
          htmlFor="instructions"
          label={t("instructions")}
          stacked
        >
          <Textarea
            defaultValue={words.materials.instructions ?? ""}
            id="instructions"
            maxLength={2000}
            name="instructions"
            placeholder={t("instructionsPlaceholder")}
            rows={3}
          />
        </SettingRow>
      </SettingsForm>
    </div>
  );
}

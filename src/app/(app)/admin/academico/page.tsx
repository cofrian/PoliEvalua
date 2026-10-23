import { getTranslations } from "next-intl/server";

import { saveAcademicContextAction } from "@/app/(app)/admin/evaluacion/actions";
import { PageHeader } from "@/components/app/page-header";
import { SettingRow, SettingsForm } from "@/components/app/settings-form";
import { Input } from "@/components/ui/input";
import { getSession } from "@/lib/app/session";

export default async function AcademicPage() {
  const { supabase, event } = await getSession();
  const [t, tc] = await Promise.all([getTranslations("academicAdmin"), getTranslations("createSpace")]);
  const { data: academic } = await supabase
    .from("event_academic_contexts")
    .select("institution, school, degree, subject_name, subject_code, academic_year, term")
    .eq("event_id", event.id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <PageHeader
        description={t("description")}
        title={t("title")}
      />
      <SettingsForm
        action={saveAcademicContextAction}
        description={t("formDescription")}
        title={t("formTitle")}
      >
        <SettingRow htmlFor="institution" label={tc("institution")}>
          <Input defaultValue={academic?.institution ?? "Universitat Politècnica de València"} id="institution" name="institution" required />
        </SettingRow>
        <SettingRow htmlFor="school" label={tc("school")}>
          <Input defaultValue={academic?.school ?? ""} id="school" name="school" placeholder="ETSINF" />
        </SettingRow>
        <SettingRow htmlFor="degree" label={tc("degree")}>
          <Input defaultValue={academic?.degree ?? ""} id="degree" name="degree" placeholder={tc("degreePlaceholder")} />
        </SettingRow>
        <SettingRow htmlFor="subjectName" label={tc("subject")}>
          <Input defaultValue={academic?.subject_name ?? ""} id="subjectName" name="subjectName" required />
        </SettingRow>
        <SettingRow htmlFor="subjectCode" label={tc("subjectCode")}>
          <Input defaultValue={academic?.subject_code ?? ""} id="subjectCode" name="subjectCode" />
        </SettingRow>
        <SettingRow htmlFor="academicYear" label={tc("year")}>
          <Input defaultValue={academic?.academic_year ?? ""} id="academicYear" name="academicYear" placeholder="2026–2027" />
        </SettingRow>
        <SettingRow htmlFor="term" label={t("term")}>
          <Input defaultValue={academic?.term ?? ""} id="term" name="term" placeholder={tc("termPlaceholder")} />
        </SettingRow>
      </SettingsForm>
    </div>
  );
}

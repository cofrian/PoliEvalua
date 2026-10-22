import { saveAcademicContextAction } from "@/app/(app)/admin/evaluacion/actions";
import { PageHeader } from "@/components/app/page-header";
import { SettingRow, SettingsForm } from "@/components/app/settings-form";
import { Input } from "@/components/ui/input";
import { getSession } from "@/lib/app/session";

export default async function AcademicPage() {
  const { supabase, event } = await getSession();
  const { data: academic } = await supabase
    .from("event_academic_contexts")
    .select("institution, school, degree, subject_name, subject_code, academic_year, term")
    .eq("event_id", event.id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <PageHeader
        description="Titulación, asignatura y curso para que el espacio encaje con la UPV."
        title="Datos académicos"
      />
      <SettingsForm
        action={saveAcademicContextAction}
        description="Relaciona el espacio con una asignatura, titulación y centro. Solo afecta a este espacio."
        title="Vinculación académica"
      >
        <SettingRow htmlFor="institution" label="Universidad o institución">
          <Input defaultValue={academic?.institution ?? "Universitat Politècnica de València"} id="institution" name="institution" required />
        </SettingRow>
        <SettingRow htmlFor="school" label="Centro o escuela">
          <Input defaultValue={academic?.school ?? ""} id="school" name="school" placeholder="ETSINF" />
        </SettingRow>
        <SettingRow htmlFor="degree" label="Titulación">
          <Input defaultValue={academic?.degree ?? ""} id="degree" name="degree" placeholder="Grado en Ingeniería Informática" />
        </SettingRow>
        <SettingRow htmlFor="subjectName" label="Asignatura">
          <Input defaultValue={academic?.subject_name ?? ""} id="subjectName" name="subjectName" required />
        </SettingRow>
        <SettingRow htmlFor="subjectCode" label="Código de asignatura">
          <Input defaultValue={academic?.subject_code ?? ""} id="subjectCode" name="subjectCode" />
        </SettingRow>
        <SettingRow htmlFor="academicYear" label="Curso académico">
          <Input defaultValue={academic?.academic_year ?? ""} id="academicYear" name="academicYear" placeholder="2026–2027" />
        </SettingRow>
        <SettingRow htmlFor="term" label="Semestre o convocatoria">
          <Input defaultValue={academic?.term ?? ""} id="term" name="term" placeholder="Primer semestre" />
        </SettingRow>
      </SettingsForm>
    </div>
  );
}

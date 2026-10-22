import {
  updateEventAction,
  updateMaterialsSettingsAction,
  updateStudentVisibilityAction,
} from "@/app/(app)/admin/actions";
import { PageHeader } from "@/components/app/page-header";
import { SettingRow, SettingSwitch, SettingsForm } from "@/components/app/settings-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getSession } from "@/lib/app/session";
import { selectClass } from "@/lib/app/ui";

export default async function AdminSettingsPage() {
  const { supabase, event, words } = await getSession();
  const statusLabels = words.stageLabels;
  const enabledRoles = ((event.settings ?? {}) as { enabled_roles?: string[] }).enabled_roles ?? [];

  const { data: eventSettings } = await supabase
    .from("events")
    .select("id, name, status, signup_code, signup_open")
    .eq("id", event.id)
    .single();

  return (
    <div className="space-y-6">
      <PageHeader
        description="Todo lo que define cómo funciona el espacio. Cada bloque se guarda por separado."
        title="Ajustes del espacio"
      />
      {eventSettings ? (
        <SettingsForm
          action={updateEventAction}
          description="Nombre, fase en la que estáis y cómo entra la gente."
          title="General"
        >
          <input name="id" type="hidden" value={eventSettings.id} />
          <SettingRow htmlFor="name" label="Nombre del espacio">
            <Input defaultValue={eventSettings.name} id="name" name="name" />
          </SettingRow>
          <SettingRow
            description="Al cerrar, nadie puede modificar evaluaciones y todo el profesorado y jurado ve los resultados."
            htmlFor="status"
            label="Fase"
          >
            <select className={`${selectClass} w-full`} defaultValue={eventSettings.status} id="status" name="status">
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </SettingRow>
          <SettingRow
            description="Quien tenga este código puede unirse al espacio desde la pantalla de inicio."
            htmlFor="signupCode"
            label="Código de acceso"
          >
            <Input
              className="font-mono uppercase"
              defaultValue={eventSettings.signup_code}
              id="signupCode"
              name="signupCode"
            />
          </SettingRow>
          <SettingRow
            description="Si lo desactivas, el código deja de funcionar (las invitaciones individuales siguen valiendo)."
            htmlFor="signupOpen"
            label="Permitir entrar con el código"
          >
            <SettingSwitch defaultChecked={eventSettings.signup_open} id="signupOpen" name="signupOpen" />
          </SettingRow>
        </SettingsForm>
      ) : null}

      {enabledRoles.includes("student") ? (
        <SettingsForm
          action={updateStudentVisibilityAction}
          description={`Qué ve cada estudiante en «Mi ${words.unitLower}».`}
          title="Alumnado"
        >
          <SettingRow
            description={`Así saben cómo se les va a evaluar antes de su ${words.presentation}.`}
            htmlFor="showRubric"
            label="Mostrar la rúbrica"
          >
            <SettingSwitch defaultChecked={words.studentsSeeRubric} id="showRubric" name="showRubric" />
          </SettingRow>
          <SettingRow
            description={`Cada ${words.unitLower} ve su propia nota y los comentarios; nunca los de los demás.`}
            htmlFor="publishResults"
            label="Publicar notas y feedback"
          >
            <SettingSwitch defaultChecked={words.resultsPublished} id="publishResults" name="publishResults" />
          </SettingRow>
        </SettingsForm>
      ) : null}

      <SettingsForm
        action={updateMaterialsSettingsAction}
        description={`Las entregas son enlaces: cada ${words.unitLower} añade su repositorio, web, vídeo o presentación desde su ficha.`}
        title="Entregas"
      >
        <SettingRow
          description="Si usáis una carpeta común (Drive, OneDrive…), aparecerá a todo el mundo."
          htmlFor="driveUrl"
          label="Carpeta común (opcional)"
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
          description="Qué entregar, dónde y hasta cuándo."
          htmlFor="instructions"
          label="Instrucciones (opcional)"
          stacked
        >
          <Textarea
            defaultValue={words.materials.instructions ?? ""}
            id="instructions"
            maxLength={2000}
            name="instructions"
            placeholder="Sube el PDF de la memoria a la carpeta común y añade aquí el enlace al repositorio y al vídeo de demo antes del viernes a las 23:59."
            rows={3}
          />
        </SettingRow>
      </SettingsForm>
    </div>
  );
}

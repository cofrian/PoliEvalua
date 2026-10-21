import { saveAcademicContextAction } from "@/app/(app)/admin/evaluacion/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSession } from "@/lib/app/session";
import { cardClass } from "@/lib/app/ui";

export default async function AcademicPage() {
  const { supabase, event } = await getSession();
  const { data: academic } = await supabase
    .from("event_academic_contexts")
    .select("institution, school, degree, subject_name, subject_code, academic_year, term")
    .eq("event_id", event.id)
    .maybeSingle();

  return (
    <section className={cardClass}>
      <h2 className="font-display text-2xl">Vinculación académica</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Relaciona este espacio con una asignatura, titulación y centro. Los datos pertenecen únicamente a este espacio.
      </p>
      <form action={saveAcademicContextAction} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold sm:col-span-2"><span className="block">Universidad o institución</span><Input defaultValue={academic?.institution ?? "Universitat Politècnica de València"} name="institution" required /></label>
        <label className="space-y-1 text-sm font-semibold"><span className="block">Centro o escuela</span><Input defaultValue={academic?.school ?? ""} name="school" placeholder="ETSINF" /></label>
        <label className="space-y-1 text-sm font-semibold"><span className="block">Titulación</span><Input defaultValue={academic?.degree ?? ""} name="degree" placeholder="Grado en Ingeniería Informática" /></label>
        <label className="space-y-1 text-sm font-semibold"><span className="block">Asignatura</span><Input defaultValue={academic?.subject_name ?? ""} name="subjectName" required /></label>
        <label className="space-y-1 text-sm font-semibold"><span className="block">Código de asignatura</span><Input defaultValue={academic?.subject_code ?? ""} name="subjectCode" /></label>
        <label className="space-y-1 text-sm font-semibold"><span className="block">Curso académico</span><Input defaultValue={academic?.academic_year ?? ""} name="academicYear" placeholder="2026–2027" /></label>
        <label className="space-y-1 text-sm font-semibold"><span className="block">Semestre o convocatoria</span><Input defaultValue={academic?.term ?? ""} name="term" placeholder="Primer semestre" /></label>
        <div className="sm:col-span-2"><Button type="submit">Guardar vinculación</Button></div>
      </form>
    </section>
  );
}


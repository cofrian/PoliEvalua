"use client";

import { Sparkles } from "lucide-react";
import { useActionState, useState } from "react";

import { createSpaceAction, type CreateSpaceState } from "@/app/(app)/espacios/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EvaluationProposal } from "@/lib/ai/evaluation-proposal";
import { selectClass } from "@/lib/app/ui";

const initialState: CreateSpaceState = {};

const roleOptions = [
  { value: "judge", label: "Jurado", description: "Puntúa mediante la rúbrica." },
  { value: "mentor", label: "Mentoría", description: "Comenta y toma notas sin votar." },
  { value: "teacher", label: "Profesorado", description: "Configura y evalúa actividades docentes." },
  { value: "student", label: "Alumnado", description: "Participa sin permisos de gestión ni voto docente." },
  { value: "reviewer", label: "Evaluadores", description: "Revisa candidaturas o proyectos." },
  { value: "viewer", label: "Consulta", description: "Acceso de solo lectura." },
] as const;

const moduleOptions = [
  { value: "participants", label: "Participantes", description: "Equipos, grupos, personas o candidaturas." },
  { value: "rubric", label: "Rúbrica", description: "Criterios, niveles, pesos y puntuaciones." },
  { value: "notes", label: "Notas", description: "Comentarios privados y compartidos." },
  { value: "results", label: "Resultados", description: "Ranking, informes y exportación." },
  { value: "sponsors", label: "Patrocinadores", description: "Logotipos y entidades colaboradoras." },
] as const;

type SpaceKind = "hackathon" | "class" | "awards" | "project" | "custom";

const templates: Record<SpaceKind, {
  participantMode: string;
  evaluationMode: string;
  academic: boolean;
  roles: string[];
  joinRoles: string[];
  modules: string[];
}> = {
  hackathon: {
    participantMode: "teams",
    evaluationMode: "rubric",
    academic: false,
    roles: ["judge", "mentor"],
    joinRoles: ["judge", "mentor"],
    modules: ["participants", "rubric", "notes", "results", "sponsors"],
  },
  class: {
    participantMode: "groups",
    evaluationMode: "mixed",
    academic: true,
    roles: ["teacher", "student"],
    joinRoles: ["student"],
    modules: ["participants", "rubric", "notes", "results"],
  },
  awards: {
    participantMode: "candidates",
    evaluationMode: "rubric",
    academic: false,
    roles: ["reviewer", "viewer"],
    joinRoles: ["viewer"],
    modules: ["participants", "rubric", "notes", "results"],
  },
  project: {
    participantMode: "individuals",
    evaluationMode: "mixed",
    academic: false,
    roles: ["teacher", "student", "reviewer"],
    joinRoles: ["student"],
    modules: ["participants", "rubric", "notes", "results"],
  },
  custom: {
    participantMode: "individuals",
    evaluationMode: "feedback",
    academic: false,
    roles: ["reviewer"],
    joinRoles: [],
    modules: ["participants", "notes"],
  },
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function toggle(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function CreateSpaceForm() {
  const [state, action, pending] = useActionState(createSpaceAction, initialState);
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [kind, setKind] = useState<SpaceKind>("hackathon");
  const [participantMode, setParticipantMode] = useState(templates.hackathon.participantMode);
  const [evaluationMode, setEvaluationMode] = useState(templates.hackathon.evaluationMode);
  const [academic, setAcademic] = useState(templates.hackathon.academic);
  const [roles, setRoles] = useState<string[]>(templates.hackathon.roles);
  const [joinRoles, setJoinRoles] = useState<string[]>(templates.hackathon.joinRoles);
  const [modules, setModules] = useState<string[]>(templates.hackathon.modules);
  const [prompt, setPrompt] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftReply, setDraftReply] = useState<string | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const [identity, setIdentity] = useState({ name: "", description: "" });
  const [draftAcademic, setDraftAcademic] = useState<EvaluationProposal["academic"]>(null);
  const [proposal, setProposal] = useState<EvaluationProposal | null>(null);
  const [draftModel, setDraftModel] = useState<string | null>(null);

  async function generateDraft() {
    if (prompt.trim().length < 3 || drafting) return;
    setDrafting(true);
    setDraftError(null);
    try {
      const response = await fetch("/api/space-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.space) {
        setDraftError(body?.error ?? "No se ha podido preparar el espacio.");
        return;
      }
      const space = body.space;
      const nextProposal: EvaluationProposal | null = body.proposal ?? null;
      setKind(space.kind);
      setParticipantMode(space.participantMode);
      setEvaluationMode(space.evaluationMode);
      setModules(space.modules);
      setRoles(space.enabledRoles);
      setJoinRoles(space.joinRoles);
      setAcademic(Boolean(nextProposal?.academic) || space.kind === "class");
      setDraftAcademic(nextProposal?.academic ?? null);
      setIdentity({ name: space.name, description: space.description ?? "" });
      if (!slugEdited) setSlug(slugify(space.name));
      setProposal(nextProposal);
      setDraftModel(typeof body.model === "string" ? body.model : null);
      setDraftReply(body.reply);
      setDraftVersion((version) => version + 1);
    } catch {
      setDraftError("No se ha podido conectar con el asistente.");
    } finally {
      setDrafting(false);
    }
  }

  function chooseTemplate(nextKind: SpaceKind) {
    const template = templates[nextKind];
    setKind(nextKind);
    setParticipantMode(template.participantMode);
    setEvaluationMode(template.evaluationMode);
    setAcademic(template.academic);
    setRoles(template.roles);
    setJoinRoles(template.joinRoles);
    setModules(template.modules);
  }

  function toggleRole(role: string) {
    setRoles((current) => {
      const next = toggle(current, role);
      if (!next.includes(role)) setJoinRoles((join) => join.filter((item) => item !== role));
      return next;
    });
  }

  return (
    <form action={action} className="space-y-8" key={draftVersion}>
      <section className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
        <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">
          <Sparkles aria-hidden="true" className="size-5" /> Descríbelo y lo preparo
        </h2>
        <p className="text-sm text-muted-foreground">
          Cuenta qué quieres evaluar, quién participa y cómo será la rúbrica. Rellenaré el formulario y dejaré la evaluación como borrador para que la revises.
        </p>
        <Textarea
          aria-label="Descripción del espacio para el asistente"
          defaultValue={prompt}
          maxLength={4000}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Asignatura de Ingeniería del Software, 3.º de GII en la ETSINF, curso 2026–2027. Grupos de 4 estudiantes presentan su proyecto y el profesorado puntúa de 0 a 10: análisis 30 %, diseño 30 %, presentación 20 %, trabajo en equipo 20 %."
          rows={4}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={drafting || prompt.trim().length < 3} onClick={() => void generateDraft()} type="button" variant="secondary">
            {drafting ? "Preparando…" : "Preparar con IA"}
          </Button>
          {drafting ? (
            <span className="text-sm text-muted-foreground" role="status">
              Puede tardar hasta un minuto.
            </span>
          ) : null}
          {proposal ? (
            <span className="text-sm text-muted-foreground">
              Rúbrica «{proposal.evaluation.rubricName}» con {proposal.evaluation.criteria.length} criterios lista como borrador.
            </span>
          ) : null}
        </div>
        {draftError ? <p className="text-sm text-destructive" role="alert">{draftError}</p> : null}
        {draftReply ? <p className="text-sm">{draftReply} Revisa los campos y pulsa «Crear espacio».</p> : null}
      </section>
      {proposal ? <input name="assistantProposal" type="hidden" value={JSON.stringify(proposal)} /> : null}
      {proposal ? <input name="assistantPrompt" type="hidden" value={prompt} /> : null}
      {proposal && draftModel ? <input name="assistantModel" type="hidden" value={draftModel} /> : null}

      {state.error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm" role="alert">
          {state.error}
        </p>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="font-heading text-xl font-semibold">1. Tipo de espacio</legend>
        <p className="text-sm text-muted-foreground">La plantilla marca un punto de partida que puedes personalizar.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["hackathon", "Hackathon"],
            ["class", "Asignatura"],
            ["awards", "Premios"],
            ["project", "Proyectos"],
            ["custom", "Personalizado"],
          ].map(([value, label]) => (
            <label className="cursor-pointer rounded-lg border border-input p-3 text-sm font-semibold has-[:checked]:border-primary has-[:checked]:bg-primary/10" key={value}>
              <input
                checked={kind === value}
                className="sr-only"
                name="kind"
                onChange={() => chooseTemplate(value as SpaceKind)}
                type="radio"
                value={value}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="font-heading text-xl font-semibold">2. Identidad</legend>
        <div className="space-y-2">
          <Label htmlFor="name">Nombre del espacio</Label>
          <Input
            defaultValue={identity.name}
            id="name"
            name="name"
            onChange={(event) => {
              if (!slugEdited) setSlug(slugify(event.target.value));
            }}
            placeholder="Premios de innovación 2027"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">Identificador web</Label>
          <Input
            id="slug"
            name="slug"
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(slugify(event.target.value));
            }}
            placeholder="premios-innovacion-2027"
            required
            value={slug}
          />
          <p className="text-xs text-muted-foreground">Solo letras minúsculas, números y guiones.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Descripción</Label>
          <Textarea defaultValue={identity.description} id="description" maxLength={500} name="description" placeholder="Qué se va a evaluar y quién participa." />
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="font-heading text-xl font-semibold">3. Qué quieres gestionar</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="participantMode">Unidad participante</Label>
            <select className={`${selectClass} w-full`} id="participantMode" name="participantMode" onChange={(event) => setParticipantMode(event.target.value)} value={participantMode}>
              <option value="teams">Equipos</option>
              <option value="groups">Grupos de clase</option>
              <option value="individuals">Personas o proyectos individuales</option>
              <option value="candidates">Candidaturas</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="evaluationMode">Forma de evaluación</Label>
            <select className={`${selectClass} w-full`} id="evaluationMode" name="evaluationMode" onChange={(event) => setEvaluationMode(event.target.value)} value={evaluationMode}>
              <option value="rubric">Rúbrica con puntuación</option>
              <option value="feedback">Solo preguntas y comentarios</option>
              <option value="mixed">Puntuación y comentarios</option>
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {moduleOptions.map((module) => (
            <label className="flex cursor-pointer gap-3 rounded-lg border border-input p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/10" key={module.value}>
              <input
                checked={modules.includes(module.value)}
                className="mt-1 size-4"
                name="modules"
                onChange={() => setModules((current) => toggle(current, module.value))}
                type="checkbox"
                value={module.value}
              />
              <span><strong className="block text-sm">{module.label}</strong><span className="text-xs text-muted-foreground">{module.description}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-xl font-semibold">4. Contexto académico</legend>
        <label className="flex items-center gap-3 rounded-lg border border-input p-3 text-sm font-semibold">
          <input checked={academic} name="academicEnabled" onChange={(event) => setAcademic(event.target.checked)} type="checkbox" />
          Vincular este espacio a una asignatura y una titulación
        </label>
        {academic ? (
          <div className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold sm:col-span-2"><span className="block">Universidad o institución</span><Input defaultValue={draftAcademic?.institution ?? "Universitat Politècnica de València"} name="institution" required /></label>
            <label className="space-y-1 text-sm font-semibold"><span className="block">Centro o escuela</span><Input defaultValue={draftAcademic?.school ?? ""} name="school" placeholder="ETSINF" /></label>
            <label className="space-y-1 text-sm font-semibold"><span className="block">Titulación</span><Input defaultValue={draftAcademic?.degree ?? ""} name="degree" placeholder="Grado en Ingeniería Informática" /></label>
            <label className="space-y-1 text-sm font-semibold"><span className="block">Asignatura</span><Input defaultValue={draftAcademic?.subjectName ?? ""} name="subjectName" required /></label>
            <label className="space-y-1 text-sm font-semibold"><span className="block">Código de asignatura</span><Input defaultValue={draftAcademic?.subjectCode ?? ""} name="subjectCode" /></label>
            <label className="space-y-1 text-sm font-semibold"><span className="block">Curso académico</span><Input defaultValue={draftAcademic?.academicYear ?? ""} name="academicYear" placeholder="2026–2027" /></label>
            <label className="space-y-1 text-sm font-semibold"><span className="block">Semestre</span><Input defaultValue={draftAcademic?.term ?? ""} name="term" placeholder="Primer semestre" /></label>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-xl font-semibold">5. Quién participa</legend>
        <p className="text-sm text-muted-foreground">Tú serás la persona propietaria. Activa los demás perfiles que utilizará este espacio.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {roleOptions.map((role) => (
            <label className="flex cursor-pointer gap-3 rounded-lg border border-input p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/10" key={role.value}>
              <input
                checked={roles.includes(role.value)}
                className="mt-1 size-4"
                name="enabledRoles"
                onChange={() => toggleRole(role.value)}
                type="checkbox"
                value={role.value}
              />
              <span><strong className="block text-sm">{role.label}</strong><span className="text-xs text-muted-foreground">{role.description}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-xl font-semibold">6. Acceso mediante código</legend>
        <div className="space-y-2">
          <Label htmlFor="accessCode">Código inicial</Label>
          <Input autoCapitalize="characters" autoComplete="off" className="uppercase" id="accessCode" minLength={6} name="accessCode" placeholder="INNOVA-2027" required />
        </div>
        <p className="text-sm text-muted-foreground">Elige qué perfiles pueden darse de alta con el código. Los demás necesitarán una invitación personal.</p>
        <div className="flex flex-wrap gap-3">
          {roleOptions.filter((role) => roles.includes(role.value) && role.value !== "teacher").map((role) => (
            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-input px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10" key={role.value}>
              <input
                checked={joinRoles.includes(role.value)}
                className="size-4"
                name="joinRoles"
                onChange={() => setJoinRoles((current) => toggle(current, role.value))}
                type="checkbox"
                value={role.value}
              />
              {role.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Button disabled={pending} type="submit">
        {pending ? "Creando espacio…" : "Crear espacio"}
      </Button>
    </form>
  );
}

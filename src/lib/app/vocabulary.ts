// Textos que cambian según el tipo de espacio: en una asignatura se habla de
// grupos y exposiciones; en un hackathon, de equipos, retos y defensas.

type SpaceKind = "hackathon" | "class" | "awards" | "project" | "custom";
type ParticipantMode = "teams" | "groups" | "individuals" | "candidates";
type EventStatus = "setup" | "building" | "judging" | "closed";
type SpaceModule = "participants" | "rubric" | "notes" | "results" | "sponsors";

const units: Record<ParticipantMode, { one: string; many: string }> = {
  teams: { one: "Equipo", many: "Equipos" },
  groups: { one: "Grupo", many: "Grupos" },
  individuals: { one: "Proyecto", many: "Proyectos" },
  candidates: { one: "Candidatura", many: "Candidaturas" },
};

const defaultMode: Record<SpaceKind, ParticipantMode> = {
  hackathon: "teams",
  class: "groups",
  awards: "candidates",
  project: "individuals",
  custom: "individuals",
};

const stages: Record<"event" | "class", Record<EventStatus, string>> = {
  event: {
    setup: "Preparación",
    building: "Desarrollo (notas)",
    judging: "Defensas (evaluación)",
    closed: "Cerrado",
  },
  class: {
    setup: "Preparación",
    building: "Trabajo en grupos (notas)",
    judging: "Exposiciones (evaluación)",
    closed: "Cerrado",
  },
};

export type Vocabulary = ReturnType<typeof vocabulary>;

export function vocabulary(event: { kind: SpaceKind; settings?: Record<string, unknown> | null }) {
  const settings = event.settings ?? {};
  const mode = (settings.participant_mode as ParticipantMode | undefined) ?? defaultMode[event.kind];
  const academic = event.kind === "class" || event.kind === "project";
  const modules = Array.isArray(settings.modules)
    ? (settings.modules as SpaceModule[])
    : null;

  return {
    unit: units[mode].one,
    units: units[mode].many,
    unitLower: units[mode].one.toLowerCase(),
    unitsLower: units[mode].many.toLowerCase(),
    evaluator: academic ? "profesorado" : event.kind === "awards" ? "comité" : "jurado",
    presentation: academic ? "exposición" : "defensa",
    stageLabels: stages[academic ? "class" : "event"],
    /** Los retos son propios de hackathons. */
    showChallenges: event.kind === "hackathon",
    /** Carpeta común de entregas e instrucciones (events.settings.materials). */
    materials: {
      driveUrl: (settings.materials as { drive_url?: string | null } | undefined)?.drive_url ?? null,
      instructions:
        (settings.materials as { instructions?: string | null } | undefined)?.instructions ?? null,
    },
    /** El alumnado ve la rúbrica salvo que la gestión lo desactive. */
    studentsSeeRubric:
      (settings.students as { show_rubric?: boolean } | undefined)?.show_rubric !== false,
    /** Cada grupo ve su feedback solo cuando la gestión lo publica. */
    resultsPublished:
      (settings.students as { publish_results?: boolean } | undefined)?.publish_results === true,
    /** null = espacio antiguo sin módulos guardados: se muestra todo. */
    hasModule: (module: SpaceModule) => !modules || modules.includes(module),
  };
}

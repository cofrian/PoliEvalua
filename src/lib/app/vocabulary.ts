// Textos que cambian según el tipo de espacio: en una asignatura se habla de
// grupos y exposiciones; en un hackathon, de equipos, retos y defensas.

type SpaceKind = "hackathon" | "class" | "awards" | "project" | "custom";
type ParticipantMode = "teams" | "groups" | "individuals" | "candidates";
type EventStatus = "setup" | "building" | "judging" | "closed";
type SpaceModule = "participants" | "rubric" | "notes" | "results" | "sponsors";

type Locale = "es" | "ca" | "en";

const units: Record<Locale, Record<ParticipantMode, { one: string; many: string }>> = {
  es: {
    teams: { one: "Equipo", many: "Equipos" },
    groups: { one: "Grupo", many: "Grupos" },
    individuals: { one: "Proyecto", many: "Proyectos" },
    candidates: { one: "Candidatura", many: "Candidaturas" },
  },
  ca: {
    teams: { one: "Equip", many: "Equips" },
    groups: { one: "Grup", many: "Grups" },
    individuals: { one: "Projecte", many: "Projectes" },
    candidates: { one: "Candidatura", many: "Candidatures" },
  },
  en: {
    teams: { one: "Team", many: "Teams" },
    groups: { one: "Group", many: "Groups" },
    individuals: { one: "Project", many: "Projects" },
    candidates: { one: "Entry", many: "Entries" },
  },
};

const defaultMode: Record<SpaceKind, ParticipantMode> = {
  hackathon: "teams",
  class: "groups",
  awards: "candidates",
  project: "individuals",
  custom: "individuals",
};

const roles: Record<Locale, { evaluator: Record<"academic" | "awards" | "event", string>; presentation: Record<"academic" | "event", string> }> = {
  es: {
    evaluator: { academic: "profesorado", awards: "comité", event: "jurado" },
    presentation: { academic: "exposición", event: "defensa" },
  },
  ca: {
    evaluator: { academic: "professorat", awards: "comité", event: "jurat" },
    presentation: { academic: "exposició", event: "defensa" },
  },
  en: {
    evaluator: { academic: "teaching staff", awards: "committee", event: "jury" },
    presentation: { academic: "presentation", event: "pitch" },
  },
};

const stages: Record<Locale, Record<"event" | "class", Record<EventStatus, string>>> = {
  es: {
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
  },
  ca: {
    event: {
      setup: "Preparació",
      building: "Desenvolupament (notes)",
      judging: "Defenses (avaluació)",
      closed: "Tancat",
    },
    class: {
      setup: "Preparació",
      building: "Treball en grups (notes)",
      judging: "Exposicions (avaluació)",
      closed: "Tancat",
    },
  },
  en: {
    event: {
      setup: "Setup",
      building: "Building (notes)",
      judging: "Pitches (evaluation)",
      closed: "Closed",
    },
    class: {
      setup: "Setup",
      building: "Group work (notes)",
      judging: "Presentations (evaluation)",
      closed: "Closed",
    },
  },
};

export type Vocabulary = ReturnType<typeof vocabulary>;

export function vocabulary(
  event: { kind: SpaceKind; settings?: Record<string, unknown> | null },
  locale: Locale = "es",
) {
  const settings = event.settings ?? {};
  const mode = (settings.participant_mode as ParticipantMode | undefined) ?? defaultMode[event.kind];
  const academic = event.kind === "class" || event.kind === "project";
  const modules = Array.isArray(settings.modules)
    ? (settings.modules as SpaceModule[])
    : null;

  const unit = (units[locale] ?? units.es)[mode];
  const role = roles[locale] ?? roles.es;

  return {
    /** Para frases con género o artículo: `{mode, select, …}` en los mensajes. */
    mode,
    unit: unit.one,
    units: unit.many,
    unitLower: unit.one.toLowerCase(),
    unitsLower: unit.many.toLowerCase(),
    evaluator: role.evaluator[academic ? "academic" : event.kind === "awards" ? "awards" : "event"],
    presentation: role.presentation[academic ? "academic" : "event"],
    stageLabels: (stages[locale] ?? stages.es)[academic ? "class" : "event"],
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

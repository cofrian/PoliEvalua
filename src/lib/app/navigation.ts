import { peerReviewSettings } from "@/lib/app/peer-review";
import type { getSession } from "@/lib/app/session";

type Session = Awaited<ReturnType<typeof getSession>>;

/** Nombre de icono que resuelve el menú en el cliente (los componentes no viajan por props). */
export type NavIcon =
  | "home"
  | "users"
  | "calendar"
  | "mic"
  | "list"
  | "chart"
  | "star"
  | "settings"
  | "user-plus"
  | "sparkles"
  | "clipboard"
  | "layers"
  | "video"
  | "qr"
  | "graduation"
  | "flag"
  | "gift"
  | "shield"
  | "group";

export type NavItem = { href: string; label: string; icon: NavIcon; primary?: boolean };
export type NavGroup = { label?: string; items: NavItem[] };

/**
 * Menú según el rol: lo que usa cada persona arriba y, para quien gestiona,
 * la administración ordenada por momentos (preparar, durante, cerrar).
 */
export function buildNavigation(session: Session): NavGroup[] {
  const { isAdmin, event, eventClosed, role, canVote, words } = session;
  const settings = (event.settings ?? {}) as { enabled_roles?: string[] };
  const hasStudents = (settings.enabled_roles ?? []).includes("student");
  const academic = event.kind === "class" || event.kind === "project";
  const showResults = (isAdmin || eventClosed) && words.hasModule("results");

  const main: NavItem[] = [
    ...(role === "student"
      ? [{ href: "/mi-grupo", label: `Mi ${words.unitLower}`, icon: "home" as const, primary: true }]
      : []),
    ...(role === "student" && peerReviewSettings(event.settings).enabled
      ? [{ href: "/coevaluacion", label: "Coevaluación", icon: "star" as const, primary: true }]
      : []),
    { href: "/equipos", label: words.units, icon: "users", primary: true },
    { href: "/agenda", label: "Agenda", icon: "calendar", primary: true },
    ...(canVote ? [{ href: "/sala", label: "Sala", icon: "mic" as const, primary: true }] : []),
    ...(words.hasModule("rubric") && (role !== "student" || words.studentsSeeRubric)
      ? [{ href: "/rubrica", label: "Rúbrica", icon: "list" as const }]
      : []),
    ...(showResults ? [{ href: "/resultados", label: "Resultados", icon: "chart" as const }] : []),
  ];

  if (!isAdmin) return [{ items: main }];

  return [
    { items: main },
    {
      label: "Preparar",
      items: [
        { href: "/admin", label: "Resumen", icon: "home" },
        { href: "/admin/ajustes", label: "Ajustes", icon: "settings" },
        { href: "/admin/personas", label: "Personas", icon: "user-plus" },
        ...(words.hasModule("participants")
          ? [{ href: "/admin/equipos", label: `Gestionar ${words.unitsLower}`, icon: "group" as const }]
          : []),
        ...(words.hasModule("rubric")
          ? [{ href: "/admin/evaluacion", label: "Evaluación", icon: "clipboard" as const }]
          : []),
        { href: "/admin/paneles", label: `Paneles de ${words.evaluator}`, icon: "layers" },
        ...(words.showChallenges ? [{ href: "/admin/retos", label: "Retos", icon: "flag" as const }] : []),
        ...(academic ? [{ href: "/admin/academico", label: "Datos académicos", icon: "graduation" as const }] : []),
        ...(words.hasModule("sponsors")
          ? [{ href: "/admin/patrocinadores", label: "Patrocinadores", icon: "gift" as const }]
          : []),
        { href: "/admin/asistente", label: "Asistente IA", icon: "sparkles" },
      ],
    },
    {
      label: "Durante",
      items: [
        { href: "/admin/agenda", label: "Organizar agenda", icon: "calendar" },
        ...(hasStudents ? [{ href: "/admin/coevaluacion", label: "Coevaluación", icon: "star" as const }] : []),
        { href: "/admin/grabaciones", label: "Grabaciones", icon: "video" },
        { href: "/admin/publico", label: "Voto del público", icon: "qr" },
      ],
    },
    {
      label: "Cerrar",
      items: [{ href: "/admin/auditoria", label: "Auditoría", icon: "shield" }],
    },
  ];
}

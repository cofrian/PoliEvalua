import type { getTranslations } from "next-intl/server";

import { peerReviewSettings } from "@/lib/app/peer-review";
import type { getSession } from "@/lib/app/session";

type Session = Awaited<ReturnType<typeof getSession>>;
type NavT = Awaited<ReturnType<typeof getTranslations<"nav">>>;

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

export type NavTab = { href: string; label: string };
/** Con `tabs`, la sección agrupa varias páginas y se muestran como pestañas arriba. */
export type NavItem = { href: string; label: string; icon: NavIcon; primary?: boolean; tabs?: NavTab[] };
export type NavGroup = { label?: string; items: NavItem[] };

/**
 * Menú según el rol: lo que usa cada persona arriba y, para quien gestiona,
 * la administración ordenada por momentos (preparar, durante, cerrar).
 */
export function buildNavigation(session: Session, t: NavT): NavGroup[] {
  const { isAdmin, event, eventClosed, role, canVote, words } = session;
  const settings = (event.settings ?? {}) as { enabled_roles?: string[] };
  const hasStudents = (settings.enabled_roles ?? []).includes("student");
  const academic = event.kind === "class" || event.kind === "project";
  const showResults = (isAdmin || eventClosed) && words.hasModule("results");

  const main: NavItem[] = [
    ...(role === "student"
      ? [{ href: "/mi-grupo", label: t("myUnit", { mode: words.mode }), icon: "home" as const, primary: true }]
      : []),
    ...(role === "student" && peerReviewSettings(event.settings).enabled
      ? [{ href: "/coevaluacion", label: t("peerReview"), icon: "star" as const, primary: true }]
      : []),
    { href: "/equipos", label: words.units, icon: "users", primary: true },
    { href: "/agenda", label: t("agenda"), icon: "calendar", primary: true },
    ...(canVote ? [{ href: "/sala", label: t("room"), icon: "mic" as const, primary: true }] : []),
    ...(words.hasModule("rubric") && (role !== "student" || words.studentsSeeRubric)
      ? [{ href: "/rubrica", label: t("rubric"), icon: "list" as const }]
      : []),
    ...(showResults ? [{ href: "/resultados", label: t("results"), icon: "chart" as const }] : []),
  ];

  if (!isAdmin) return [{ items: main }];

  // Quien gestiona ve seis secciones; cada una agrupa sus páginas en pestañas.
  const participants: NavTab[] = [
    { href: "/equipos", label: t("tabs.list", { units: words.unitsLower }) },
    ...(words.hasModule("participants") ? [{ href: "/admin/equipos", label: t("tabs.edit") }] : []),
    { href: "/admin/personas", label: t("people") },
    { href: "/admin/paneles", label: t("panels", { evaluator: words.evaluator }) },
    ...(words.showChallenges ? [{ href: "/admin/retos", label: t("challenges") }] : []),
  ];
  const evaluation: NavTab[] = [
    ...(words.hasModule("rubric") ? [{ href: "/rubrica", label: t("rubric") }] : []),
    { href: "/admin/evaluacion", label: t("tabs.form") },
    ...(hasStudents ? [{ href: "/admin/coevaluacion", label: t("peerReview") }] : []),
    ...(showResults ? [{ href: "/resultados", label: t("results") }] : []),
  ];
  const schedule: NavTab[] = [
    { href: "/admin/agenda", label: t("agenda") },
    { href: "/sala", label: t("room") },
  ];
  const live: NavTab[] = [
    { href: "/admin/grabaciones", label: t("recordings") },
    { href: "/admin/publico", label: t("publicVote") },
  ];
  const settingsTabs: NavTab[] = [
    { href: "/admin/ajustes", label: t("tabs.general") },
    ...(academic ? [{ href: "/admin/academico", label: t("academic") }] : []),
    ...(words.hasModule("sponsors") ? [{ href: "/admin/patrocinadores", label: t("sponsors") }] : []),
    { href: "/admin/auditoria", label: t("audit") },
  ];

  return [
    {
      items: [
        { href: "/admin", label: t("home"), icon: "home", primary: true },
        { href: participants[0].href, label: t("participants"), icon: "users", primary: true, tabs: participants },
        { href: evaluation[0]?.href ?? "/admin/evaluacion", label: t("evaluation"), icon: "clipboard", primary: true, tabs: evaluation },
        { href: "/admin/agenda", label: t("agenda"), icon: "calendar", primary: true, tabs: schedule },
        { href: "/admin/grabaciones", label: t("recordingsAndPublic"), icon: "video", tabs: live },
        { href: "/admin/asistente", label: t("assistant"), icon: "sparkles" },
        { href: "/admin/ajustes", label: t("settings"), icon: "settings", tabs: settingsTabs },
      ],
    },
  ];
}

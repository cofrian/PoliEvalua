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

export type NavItem = { href: string; label: string; icon: NavIcon; primary?: boolean };
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

  return [
    { items: main },
    {
      label: t("prepare"),
      items: [
        { href: "/admin", label: t("overview"), icon: "home" },
        { href: "/admin/ajustes", label: t("settings"), icon: "settings" },
        { href: "/admin/personas", label: t("people"), icon: "user-plus" },
        ...(words.hasModule("participants")
          ? [{ href: "/admin/equipos", label: t("manageUnits", { units: words.unitsLower }), icon: "group" as const }]
          : []),
        ...(words.hasModule("rubric")
          ? [{ href: "/admin/evaluacion", label: t("evaluation"), icon: "clipboard" as const }]
          : []),
        { href: "/admin/paneles", label: t("panels", { evaluator: words.evaluator }), icon: "layers" },
        ...(words.showChallenges ? [{ href: "/admin/retos", label: t("challenges"), icon: "flag" as const }] : []),
        ...(academic ? [{ href: "/admin/academico", label: t("academic"), icon: "graduation" as const }] : []),
        ...(words.hasModule("sponsors")
          ? [{ href: "/admin/patrocinadores", label: t("sponsors"), icon: "gift" as const }]
          : []),
        { href: "/admin/asistente", label: t("assistant"), icon: "sparkles" },
      ],
    },
    {
      label: t("during"),
      items: [
        { href: "/admin/agenda", label: t("organizeAgenda"), icon: "calendar" },
        ...(hasStudents ? [{ href: "/admin/coevaluacion", label: t("peerReview"), icon: "star" as const }] : []),
        { href: "/admin/grabaciones", label: t("recordings"), icon: "video" },
        { href: "/admin/publico", label: t("publicVote"), icon: "qr" },
      ],
    },
    {
      label: t("close"),
      items: [{ href: "/admin/auditoria", label: t("audit"), icon: "shield" }],
    },
  ];
}

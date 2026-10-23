import type { AbstractIntlMessages } from "next-intl";

/**
 * Grupos de textos que usan los componentes con `useTranslations`. Solo estos
 * viajan al navegador; el resto (errores de servidor, páginas de Admin…) se
 * traduce en el servidor. `npm run test:messages` avisa si falta alguno.
 */
export const CLIENT_NAMESPACES = [
  "agenda",
  "agendaAdmin",
  "assistant",
  "aiEvidence",
  "auth",
  "challengesAdmin",
  "common",
  "createSpace",
  "discrepancies",
  "duplicate",
  "evalForm",
  "feedback",
  "importTeams",
  "invite",
  "join",
  "links",
  "locale",
  "nav",
  "notes",
  "peer",
  "peerAdmin",
  "profile",
  "publicVote",
  "recordingNotice",
  "results",
  "roles",
  "roster",
  "rubricEditor",
  "slot",
  "spaceKinds",
  "sponsorsAdmin",
  "studio",
  "teamEditor",
  "teams",
  "tour",
  "userMenu",
  "weaknesses",
] as const;

export function pickClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  return Object.fromEntries(
    CLIENT_NAMESPACES.filter((namespace) => namespace in messages).map((namespace) => [
      namespace,
      messages[namespace],
    ]),
  );
}

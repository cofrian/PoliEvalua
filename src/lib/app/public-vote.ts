// Voto del público: configuración (events.settings.public_vote).

export type PublicVoteSettings = { open: boolean; title: string | null; showResults: boolean };

export function publicVoteSettings(settings: unknown): PublicVoteSettings {
  const raw =
    settings && typeof settings === "object" && "public_vote" in settings
      ? ((settings as { public_vote?: Record<string, unknown> }).public_vote ?? {})
      : {};
  return {
    open: raw.open === true,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : null,
    showResults: raw.show_results === true,
  };
}

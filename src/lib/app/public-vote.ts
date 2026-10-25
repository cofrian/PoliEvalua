// Voto del público: configuración (events.settings.public_vote).

/** «favorite»: cada dispositivo elige un proyecto. «rubric»: puntúa cada proyecto con la rúbrica. */
export type PublicVoteMode = "favorite" | "rubric";

export type PublicVoteSettings = { open: boolean; title: string | null; showResults: boolean; mode: PublicVoteMode };

export function publicVoteSettings(settings: unknown): PublicVoteSettings {
  const raw =
    settings && typeof settings === "object" && "public_vote" in settings
      ? ((settings as { public_vote?: Record<string, unknown> }).public_vote ?? {})
      : {};
  return {
    open: raw.open === true,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : null,
    showResults: raw.show_results === true,
    mode: raw.mode === "rubric" ? "rubric" : "favorite",
  };
}

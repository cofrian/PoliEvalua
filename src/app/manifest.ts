import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PoliEvalúa",
    short_name: "PoliEvalúa",
    description: "Plataforma de código abierto para evaluar hackathons y clases.",
    start_url: "/equipos",
    display: "standalone",
    background_color: "#f8f8f7",
    theme_color: "#3f4444",
    lang: "es",
    icons: [
      { src: "/icons/polievalua.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}

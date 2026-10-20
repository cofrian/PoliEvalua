import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Evalúa · Universitat Politècnica de València",
    short_name: "Evalúa UPV",
    description: "Espacios configurables de evaluación para la comunidad UPV.",
    start_url: "/equipos",
    display: "standalone",
    background_color: "#f8f8f7",
    theme_color: "#3f4444",
    lang: "es",
    icons: [
      { src: "/icons/upv-evalua.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}

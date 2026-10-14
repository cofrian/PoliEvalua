import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "València Hack · Panel del jurado",
    short_name: "VLC Hack Jurado",
    description: "Notas y evaluación del jurado de València Hack.",
    start_url: "/equipos",
    display: "standalone",
    background_color: "#fffbf5",
    theme_color: "#1f2557",
    lang: "es",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

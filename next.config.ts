import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El binario de ffmpeg se carga en tiempo de ejecución para convertir audio
  // a WAV solo si el proveedor rechaza Opus.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/ffmpeg-static/ffmpeg*"],
  },
  experimental: {
    // Logos de patrocinadores y fotos de perfil.
    serverActions: { bodySizeLimit: "5mb" },
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;

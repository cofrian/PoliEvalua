import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Logos de patrocinadores y fotos de perfil.
    serverActions: { bodySizeLimit: "5mb" },
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;

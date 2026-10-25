import { defineConfig } from "@playwright/test";

// Pruebas de punta a punta contra la web publicada (o E2E_BASE_URL).
// Usan el Chrome instalado en el equipo. Ejecutar: npm run test:e2e
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://polievalua.tech",
    channel: "chrome",
    headless: true,
    locale: "es-ES",
    viewport: { width: 1280, height: 900 },
  },
});

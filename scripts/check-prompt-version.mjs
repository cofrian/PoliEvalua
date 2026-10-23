// Falla si cambia algún texto de los prompts sin subir PROMPT_VERSION.
// Con --print muestra el hash actual para registrarlo en PROMPT_HASHES.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const file = new URL("../src/lib/ai/prompts/presentation.ts", import.meta.url);
const source = readFileSync(file, "utf8").replace(/\r\n/g, "\n");

const version = source.match(/export const PROMPT_VERSION = "([^"]+)";/)?.[1];
const registry = source.match(/export const PROMPT_HASHES[^{]*\{([^}]*)\};/);
if (!version || !registry) {
  console.error("No se encuentran PROMPT_VERSION o PROMPT_HASHES.");
  process.exit(1);
}

// Se hashea todo menos la cabecera de versión y el propio registro.
const body = source.slice(source.indexOf(registry[0]) + registry[0].length);
const hash = createHash("sha256").update(body).digest("hex").slice(0, 16);

if (process.argv.includes("--print")) {
  console.log(hash);
  process.exit(0);
}

const expected = Object.fromEntries(
  [...registry[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]),
)[version];
if (expected !== hash) {
  console.error(
    `Los prompts han cambiado (hash ${hash}) pero PROMPT_VERSION ${version} registra ${expected ?? "nada"}.\n` +
      "Sube PROMPT_VERSION y añade el hash nuevo a PROMPT_HASHES.",
  );
  process.exit(1);
}
console.log(`Prompts v${version} coherentes (${hash}).`);

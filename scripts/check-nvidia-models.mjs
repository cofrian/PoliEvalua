// Comprueba que los modelos por defecto de src/lib/ai/models.ts siguen en el
// catálogo público de NVIDIA. No necesita clave. Falla si alguna tarea se queda
// sin modelos; avisa (sin fallar) si falta el principal o algún respaldo.
//
//   node scripts/check-nvidia-models.mjs

import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/lib/ai/models.ts", import.meta.url), "utf8");
const block = source.match(/DEFAULT_MODELS[^=]*=\s*\{([\s\S]*?)\n\};/);
if (!block) {
  console.error("No se encontró DEFAULT_MODELS en src/lib/ai/models.ts");
  process.exit(1);
}

const tasks = {};
for (const [, task, list] of block[1].matchAll(/(\w+):\s*\[([\s\S]*?)\]/g)) {
  tasks[task] = [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

const response = await fetch("https://integrate.api.nvidia.com/v1/models", {
  signal: AbortSignal.timeout(20_000),
});
if (!response.ok) {
  // Una caída de NVIDIA no debe bloquear un PR: se avisa y se sale bien.
  console.warn(`::warning::El catálogo de NVIDIA respondió ${response.status}; no se pudo comprobar.`);
  process.exit(0);
}
const available = new Set(((await response.json()).data ?? []).map((model) => model.id));

let failed = false;
for (const [task, models] of Object.entries(tasks)) {
  const missing = models.filter((id) => !available.has(id));
  const listed = models.length - missing.length;
  console.log(`${task}: ${listed}/${models.length} disponibles`);
  for (const id of missing) {
    const primary = id === models[0];
    console.log(`::warning::[${task}] ${id} ya no está en NVIDIA${primary ? " (es el principal)" : ""}`);
  }
  if (listed === 0) {
    console.log(`::error::[${task}] no queda ningún modelo disponible`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);

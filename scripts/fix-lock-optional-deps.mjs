// npm en Windows omite del package-lock dependencias opcionales que solo se
// usan en Linux (las de @img/sharp-wasm32), y entonces `npm ci` falla en CI.
// Este script las vuelve a añadir con los datos exactos del registro.
//
//   node scripts/fix-lock-optional-deps.mjs   (después de cada npm install en Windows)

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const LOCK = new URL("../package-lock.json", import.meta.url);
const lock = JSON.parse(readFileSync(LOCK, "utf8"));
const packages = lock.packages;

const npm = (args) =>
  JSON.parse(execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", args, { encoding: "utf8", shell: true }));

/** Igual que Node: busca el paquete subiendo por los node_modules anidados. */
function resolves(fromPath, name) {
  let base = fromPath;
  while (true) {
    if (packages[`${base ? `${base}/` : ""}node_modules/${name}`]) return true;
    const index = base.lastIndexOf("/node_modules/");
    if (index < 0) return Boolean(packages[`node_modules/${name}`]);
    base = base.slice(0, index);
  }
}

// Dependencias que algún paquete del lock pide y que no se pueden resolver.
const missing = new Map();
for (const [path, info] of Object.entries(packages)) {
  if (!path) continue;
  for (const [name, range] of Object.entries({ ...info.dependencies, ...info.optionalDependencies })) {
    if (!resolves(path, name) && !missing.has(name)) missing.set(name, range);
  }
}
for (const [name, range] of missing) {
  const version = npm(["view", `${name}@${range}`, "version", "--json"]);
  missing.set(name, Array.isArray(version) ? version.at(-1) : version);
}

// Lo que necesita producción no puede ir marcado como solo de desarrollo.
for (const [path, info] of Object.entries(packages)) {
  if (path.endsWith("node_modules/@emnapi/wasi-threads") && info.dev && info.optional) delete info.dev;
}

if (!missing.size) console.log("No faltan dependencias en package-lock.json.");

for (const [name, version] of missing) {
  const meta = npm(["view", `${name}@${version}`, "dist", "dependencies", "license", "--json"]);
  packages[`node_modules/${name}`] = {
    version,
    resolved: meta.dist.tarball,
    integrity: meta.dist.integrity,
    license: meta.license,
    optional: true,
    ...(meta.dependencies ? { dependencies: meta.dependencies } : {}),
  };
  console.log(`Añadido ${name}@${version}`);
}

lock.packages = Object.fromEntries(
  Object.entries(packages).sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a < b ? -1 : a > b ? 1 : 0)),
);
writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`);

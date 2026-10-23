// Falla si algún idioma no tiene exactamente las mismas claves que el castellano.
import { readFileSync } from "node:fs";

const read = (locale) => JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
const keys = (value, prefix = "") =>
  Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === "object" ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`],
  );

const base = new Set(keys(read("es")));
let failed = false;
for (const locale of ["ca", "en"]) {
  const other = new Set(keys(read(locale)));
  const missing = [...base].filter((key) => !other.has(key));
  const extra = [...other].filter((key) => !base.has(key));
  if (missing.length || extra.length) {
    failed = true;
    console.error(`${locale}: faltan [${missing.join(", ")}]; sobran [${extra.join(", ")}]`);
  }
}
// Todo grupo usado con useTranslations tiene que viajar al navegador.
const clientList = readFileSync(new URL("../src/i18n/client-messages.ts", import.meta.url), "utf8");
const clientNamespaces = new Set([...clientList.matchAll(/^\s+"([a-zA-Z]+)",$/gm)].map((m) => m[1]));
const { readdirSync, statSync } = await import("node:fs");
const { join } = await import("node:path");
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
const srcDir = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
for (const file of walk(decodeURIComponent(srcDir))) {
  for (const match of readFileSync(file, "utf8").matchAll(/useTranslations\(\s*"([^".]+)/g)) {
    if (!clientNamespaces.has(match[1])) {
      failed = true;
      console.error(`${file}: useTranslations("${match[1]}") no está en CLIENT_NAMESPACES (src/i18n/client-messages.ts).`);
    }
  }
}
if (failed) process.exit(1);
console.log(`Traducciones coherentes (${base.size} claves en es, ca y en).`);

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
if (failed) process.exit(1);
console.log(`Traducciones coherentes (${base.size} claves en es, ca y en).`);

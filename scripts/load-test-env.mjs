import fs from "node:fs";

export function loadTestEnv() {
  const fromFile = fs.existsSync(".env.local")
    ? Object.fromEntries(
        fs
          .readFileSync(".env.local", "utf8")
          .split(/\r?\n/)
          .filter((line) => line.includes("=") && !line.startsWith("#"))
          .map((line) => {
            const separator = line.indexOf("=");
            return [
              line.slice(0, separator).trim(),
              line.slice(separator + 1).trim().replace(/^"|"$/g, ""),
            ];
          }),
      )
    : {};

  return { ...fromFile, ...process.env };
}

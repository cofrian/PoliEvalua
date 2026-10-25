// Logos del repositorio (docs/brand): wordmark claro y oscuro, icono y portada
// para compartir (1280×640). Se regeneran con: node scripts/brand-assets.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { copyFileSync } from "node:fs";
const out = "docs/brand";
const bracket = (side, color) => `<svg viewBox="0 0 10 28" style="height:1.15em;width:.38em;margin:0 .04em"><path d="${side === "l" ? "M9 2H3v24h6" : "M1 2h6v24H1"}" fill="none" stroke="${color}" stroke-linecap="square" stroke-width="3.2"/></svg>`;
const word = (ink) => `<span style="display:inline-flex;align-items:center;font-family:Poppins;font-weight:700;letter-spacing:-.02em;color:${ink}"><span>Poli</span>${bracket("l", "#ffd100")}<span style="font-weight:600">Evalúa</span>${bracket("r", "#ffd100")}</span>`;
const head = `<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@500;600&display=swap" rel="stylesheet"><style>html,body{margin:0;background:transparent}</style>`;
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const page = await b.newPage({ deviceScaleFactor: 2 });
for (const [name, ink] of [["wordmark-light", "#111111"], ["wordmark-dark", "#ffffff"]]) {
  await page.setContent(`${head}<div id="w" style="display:inline-block;padding:12px 16px;font-size:96px">${word(ink)}</div>`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#w").screenshot({ path: `${out}/${name}.png`, omitBackground: true });
}
// Portada para compartir (GitHub Social preview 1280×640).
await page.setViewportSize({ width: 1280, height: 640 });
await page.setContent(`${head}<div style="width:1280px;height:640px;position:relative;overflow:hidden;background:#0d0d0f;font-family:Inter;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center">
<div style="position:absolute;inset:0 auto 0 0;width:22%;background:#ffd100;clip-path:polygon(0 0,100% 0,66% 100%,0 100%)"></div>
<div style="position:absolute;bottom:0;left:10%;height:46%;width:15%;background:#59cbe8;clip-path:polygon(0 0,60% 0,100% 100%,40% 100%)"></div>
<div style="position:absolute;inset:0 0 0 auto;width:22%;background:#ffd100;clip-path:polygon(34% 0,100% 0,100% 100%,0 100%)"></div>
<div style="position:absolute;top:0;right:10%;height:46%;width:15%;background:#59cbe8;clip-path:polygon(40% 0,100% 0,60% 100%,0 100%)"></div>
<img src="data:image/png;base64,ICON" style="width:96px;height:96px;border-radius:22px;position:relative">
<div style="font-size:104px;margin-top:18px;position:relative">${word("#ffffff")}</div>
<div style="font-size:30px;color:rgba(255,255,255,.8);margin-top:10px;position:relative">Evaluación en directo para hackathons y clases</div>
<div style="margin-top:26px;display:flex;gap:14px;font-weight:600;font-size:22px;position:relative"><span style="background:#ffd100;color:#111;border-radius:999px;padding:6px 18px">Open source · MIT</span><span style="border:2px solid rgba(255,255,255,.4);border-radius:999px;padding:4px 18px">polievalua.tech</span></div>
</div>`.replace("ICON", (await import("node:fs")).readFileSync("public/icons/icon-192.png").toString("base64")));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/social-preview.png` });
await b.close();
copyFileSync("public/icons/icon-512.png", `${out}/icon-512.png`);
copyFileSync("public/icons/polievalua.svg", `${out}/icon.svg`);
console.log("ok");

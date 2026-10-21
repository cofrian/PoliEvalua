// Qué modelos de NVIDIA funcionan con TU clave y cómo de rápido.
//
// El catálogo público lista modelos a los que una cuenta concreta puede no
// tener acceso (404 «Function not found for account») o que se quedan en cola.
//
//   $env:NVIDIA_API_KEY = "nvapi-..."
//   node scripts/benchmark-nvidia-models.mjs --all          prueba rápida de todo el catálogo
//   node scripts/benchmark-nvidia-models.mjs --ping a b     prueba rápida de esos modelos
//   node scripts/benchmark-nvidia-models.mjs a b            prueba rápida + rúbrica completa

const apiKey = process.env.NVIDIA_API_KEY;
if (!apiKey) {
  console.error("Define NVIDIA_API_KEY en el entorno antes de ejecutar.");
  process.exit(1);
}

const BASE = "https://integrate.api.nvidia.com/v1";
// Igual que la app: sin razonamiento interno (cada plantilla lee su clave).
const NO_THINKING = { chat_template_kwargs: { thinking: false, enable_thinking: false } };
const NOT_CHAT = /embed|rerank|safety|guard|reward|parse|clip|vision-only|retriever|nv-ingest/i;

const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith("--")));
const requested = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

let models = requested;
if (flags.has("--all")) {
  const catalog = await (await fetch(`${BASE}/models`)).json();
  models = catalog.data.map((model) => model.id).filter((id) => !NOT_CHAT.test(id));
} else if (!models.length) {
  models = ["nvidia/nemotron-3.5-lightning-30b-a3b"];
}

async function chat(model, messages, extra, timeoutMs) {
  const started = Date.now();
  const response = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: 0.2, ...NO_THINKING, ...extra }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body, seconds: (Date.now() - started) / 1000 };
}

// 1) Prueba rápida, todos a la vez.
console.log(`Prueba rápida de ${models.length} modelo(s)…\n`);
const pings = await Promise.all(
  models.map(async (model) => {
    try {
      const { status, body, seconds } = await chat(model, [{ role: "user", content: "Responde solo: OK" }], { max_tokens: 20 }, 20_000);
      const content = body.choices?.[0]?.message?.content;
      if (status !== 200) return { model, ok: false, note: `HTTP ${status} ${String(body.detail ?? body.error?.message ?? "").slice(0, 70)}` };
      return {
        model,
        ok: Boolean(content),
        seconds,
        note: content ? `«${content.trim().slice(0, 20)}»` : "responde solo con razonamiento (content vacío)",
      };
    } catch (error) {
      return { model, ok: false, note: error.name === "TimeoutError" ? "sin respuesta en 20 s" : error.message };
    }
  }),
);

const working = pings.filter((ping) => ping.ok).sort((a, b) => a.seconds - b.seconds);
for (const ping of working) console.log(`  ✔ ${ping.model}  ${ping.seconds.toFixed(1)} s  ${ping.note}`);
console.log(`\n${working.length} responden. ${pings.length - working.length} no:`);
for (const ping of pings.filter((item) => !item.ok)) console.log(`  ✘ ${ping.model}  ${ping.note}`);

if (flags.has("--ping") || flags.has("--all")) process.exit(0);

// 2) Rúbrica completa con los que responden.
const prompt = `Devuelve SOLO un objeto JSON con esta forma:
{"rubricName": string, "criteria": [{"title": string, "weight": number, "levels": [{"score": number, "label": string, "descriptor": string}]}]}
Rúbrica en español para exposiciones orales de proyectos de Ingeniería del Software (3.º GII, UPV),
escala 0 a 10, 4 o 5 criterios cuyos pesos sumen exactamente 100 y 4 niveles por criterio.`;

console.log("\nRúbrica completa:");
for (const { model } of working) {
  try {
    const { status, body, seconds } = await chat(
      model,
      [{ role: "user", content: prompt }],
      { max_tokens: 4000, response_format: { type: "json_object" } },
      90_000,
    );
    if (status !== 200) throw new Error(`HTTP ${status}`);
    const content = body.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1));
    const sum = (parsed.criteria ?? []).reduce((total, item) => total + Number(item.weight || 0), 0);
    console.log(`  ${model}: ${seconds.toFixed(1)} s · ${parsed.criteria?.length ?? 0} criterios · pesos ${sum}${sum === 100 ? " ✔" : " ✘"}`);
  } catch (error) {
    console.log(`  ${model}: ✘ ${error.name === "TimeoutError" ? "más de 90 s" : error.message}`);
  }
}

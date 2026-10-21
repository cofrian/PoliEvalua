// Compara modelos de NVIDIA con una petición real de rúbrica: tiempo, JSON
// válido y pesos que suman 100. Úsalo para ordenar DEFAULT_MODELS.
//
//   $env:NVIDIA_API_KEY = "nvapi-..."; node scripts/benchmark-nvidia-models.mjs
//   node scripts/benchmark-nvidia-models.mjs modelo/a modelo/b   (lista propia)

const apiKey = process.env.NVIDIA_API_KEY;
if (!apiKey) {
  console.error("Define NVIDIA_API_KEY en el entorno antes de ejecutar.");
  process.exit(1);
}

const models = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "deepseek-ai/deepseek-v4.1-flash",
      "z-ai/glm-5.3-flash",
      "z-ai/glm-5.3",
      "moonshotai/kimi-k2.6",
      "nvidia/nemotron-3-super-120b-a12b",
      "nvidia/nemotron-3-ultra-550b-a55b",
    ];

const prompt = `Devuelve SOLO un objeto JSON con esta forma:
{"rubricName": string, "criteria": [{"title": string, "weight": number, "levels": [{"score": number, "label": string, "descriptor": string}]}]}
Rúbrica en español para exposiciones orales de proyectos de Ingeniería del Software (3.º GII, UPV),
escala 0 a 10, 4 o 5 criterios cuyos pesos sumen exactamente 100 y 4 niveles por criterio.`;

const rows = [];
for (const model of models) {
  const started = Date.now();
  const row = { model, seconds: 0, json: false, weights: "-", criteria: 0, error: "" };
  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`HTTP ${response.status} ${body?.detail ?? body?.error?.message ?? ""}`);
    const content = body.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1));
    row.json = true;
    row.criteria = parsed.criteria?.length ?? 0;
    const sum = (parsed.criteria ?? []).reduce((total, item) => total + Number(item.weight || 0), 0);
    row.weights = sum === 100 ? "100 ✔" : `${sum} ✘`;
  } catch (error) {
    row.error = String(error.message ?? error).slice(0, 80);
  }
  row.seconds = Math.round((Date.now() - started) / 100) / 10;
  rows.push(row);
  console.log(`${model}: ${row.error || `${row.seconds}s, ${row.criteria} criterios, pesos ${row.weights}`}`);
}

console.table(rows);

import { buildProviderStatusPayload, listNvidiaModels } from "../src/routes/providers.js";

const keys = {
  groqKey: process.env.GROQ_API_KEY ?? null,
  ollamaKey: process.env.OLLAMA_API_KEY ?? null,
  ollamaBase: process.env.OLLAMA_BASE_URL ?? null,
  nvidiaKey: process.env.NVIDIA_API_KEY ?? null,
  geminiKey: process.env.GEMINI_API_KEY ?? null,
  openrouterKey: process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_KEY ?? null,
  githubToken: process.env.GITHUB_MODELS_API_KEY ?? process.env.GITHUB_TOKEN ?? null,
  tavilyKey: process.env.TAVILY_API_KEY ?? null,
  serperKey: process.env.SERPER_API_KEY ?? null,
  braveKey: process.env.BRAVE_API_KEY ?? null,
  jinaKey: process.env.JINA_API_KEY ?? process.env.JINA_KEY ?? null,
  hfToken: process.env.HF_TOKEN ?? null,
};

function configuredNames(): string[] {
  return [
    keys.groqKey ? "GROQ_API_KEY" : "",
    keys.nvidiaKey ? "NVIDIA_API_KEY" : "",
    keys.openrouterKey ? "OPENROUTER_API_KEY/OPENROUTER_KEY" : "",
    keys.githubToken ? "GITHUB_MODELS_API_KEY/GITHUB_TOKEN" : "",
    keys.geminiKey ? "GEMINI_API_KEY" : "",
  ].filter(Boolean);
}

console.log("BestDel provider refresh smoke");
console.log("Configured keys:", configuredNames().join(", ") || "none");

const status = await buildProviderStatusPayload(keys);
console.table(Object.entries(status.providers).map(([provider, info]) => ({
  provider,
  configured: info.configured,
  healthy: info.healthy,
  status: info.status,
  modelCount: info.modelCount,
  source: info.source ?? "",
  latencyMs: info.latencyMs ?? "",
})));

if (keys.nvidiaKey) {
  const nvidia = await listNvidiaModels(keys.nvidiaKey);
  const hasKimi = nvidia.models.some((model) => model.id === "moonshotai/kimi-k2.6");
  console.log("NVIDIA models:", {
    healthy: nvidia.healthy,
    status: nvidia.status,
    source: nvidia.source,
    modelCount: nvidia.models.length,
    kimiK26: hasKimi,
  });
} else {
  console.log("NVIDIA_API_KEY missing; skipped NVIDIA live model smoke.");
}

if (!configuredNames().length) {
  console.log("No live keys configured. Smoke completed without fake provider success.");
}


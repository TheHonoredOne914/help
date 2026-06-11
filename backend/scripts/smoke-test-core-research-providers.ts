import { buildCoreProviderRouter } from "../src/services/anthropic-service.js";
import { buildProviderStatusPayload } from "../src/routes/providers.js";
import { createLatencyBudget } from "../src/core/latency/latency-budget.js";

const keys = {
  groqKey: process.env.GROQ_API_KEY ?? null,
  ollamaKey: null,
  ollamaBase: null,
  nvidiaKey: process.env.NVIDIA_API_KEY ?? null,
  geminiKey: process.env.GEMINI_API_KEY ?? null,
  openrouterKey: process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_KEY ?? null,
  githubToken: process.env.GITHUB_MODELS_API_KEY ?? process.env.GITHUB_TOKEN ?? null,
  tavilyKey: process.env.TAVILY_API_KEY ?? null,
  serperKey: process.env.SERPER_API_KEY ?? null,
  braveKey: process.env.BRAVE_API_KEY ?? process.env.BRAVE_KEY ?? null,
  jinaKey: process.env.JINA_API_KEY ?? process.env.JINA_KEY ?? null,
  hfToken: process.env.HF_TOKEN ?? null,
};

const candidates = [
  "nvidia/moonshotai/kimi-k2.6",
  "github/openai/gpt-4.1",
  "gemini/gemini-2.5-flash",
  "openrouter/openai/gpt-4o-mini",
  "groq/llama-3.3-70b-versatile",
];

const configured = candidates.map((model) => {
  const routed = buildCoreProviderRouter(keys, model);
  return {
    model,
    providerName: routed.providerName ?? null,
    nativeModel: routed.model ?? null,
    configured: !routed.error,
    error: routed.error,
  };
});

const budget = createLatencyBudget("fast_research");
budget.startStage("source_usage");
budget.endStage("source_usage");

console.log(JSON.stringify({
  providerHealth: await buildProviderStatusPayload(keys),
  coreProviderRoutes: configured,
  latency: {
    totalBudgetMs: budget.totalBudgetMs,
    providerCallTimeoutMs: budget.providerCallTimeoutMs,
    events: budget.events,
  },
}, null, 2));

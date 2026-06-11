import "dotenv/config";
import { getHealthyProvidersForResearch, type ProviderResearchStatus } from "../src/core/providers/provider-health.js";
import { getSourceUsagePolicy } from "../src/core/config/source-usage-policy.js";

type Mode = "normal" | "rhetorics" | "web_search" | "fast_research" | "deep_research" | "deep_research" | "council";

const requireLiveKeys = process.argv.includes("--require-live-keys");
const modelKeys = {
  groq: Boolean(process.env.GROQ_API_KEY),
  openrouter: Boolean(process.env.OPENROUTER_API_KEY),
  gemini: Boolean(process.env.GEMINI_API_KEY),
};
const searchKeys = {
  tavily: Boolean(process.env.TAVILY_API_KEY),
  brave: Boolean(process.env.BRAVE_API_KEY),
  serper: Boolean(process.env.SERPER_API_KEY),
  jina: Boolean(process.env.JINA_API_KEY),
};

const statuses: ProviderResearchStatus[] = [
  { providerName: "groq", configured: modelKeys.groq, supportsJsonTasks: true, error: modelKeys.groq ? undefined : "GROQ_API_KEY missing" },
  { providerName: "openrouter", configured: modelKeys.openrouter, supportsJsonTasks: true, error: modelKeys.openrouter ? undefined : "OPENROUTER_API_KEY missing" },
  { providerName: "gemini", configured: modelKeys.gemini, supportsJsonTasks: true, models: ["gemini-2.5-pro", "gemini-2.5-flash"], error: modelKeys.gemini ? undefined : "GEMINI_API_KEY missing" },
];

const health = getHealthyProvidersForResearch({
  selectedProvider: "gemini",
  selectedModel: "gemini-2.5-pro",
  fallbackModels: [
    { providerName: "groq", model: "llama-3.3-70b-versatile" },
    { providerName: "openrouter", model: "anthropic/claude-3.5-sonnet" },
  ],
  providerStatuses: statuses,
});

console.log("Provider health");
console.log(JSON.stringify({
  healthyProviders: health.healthyProviders,
  unhealthyProviders: health.unhealthyProviders,
  selectedProvider: health.selectedProvider,
  selectedModel: health.selectedModel,
  errors: health.errors,
}, null, 2));

console.log("Search key status");
console.log(JSON.stringify(searchKeys, null, 2));

const missing = [
  ...Object.entries(modelKeys).filter(([, present]) => !present).map(([name]) => `${name.toUpperCase()}_API_KEY`),
  ...(Object.values(searchKeys).some(Boolean) ? [] : ["TAVILY_API_KEY or BRAVE_API_KEY or SERPER_API_KEY or JINA_API_KEY"]),
];
if (missing.length) {
  console.log(`Missing keys: ${missing.join(", ")}`);
}

const modes: Mode[] = ["normal", "rhetorics", "web_search", "fast_research", "deep_research", "deep_research", "council"];
for (const mode of modes) {
  if (mode === "normal" || mode === "rhetorics") {
    console.log(`${mode}: ${health.healthyProviders.length ? `ready via ${health.selectedProvider}/${health.selectedModel}` : "provider_config_error"}`);
    continue;
  }
  const policy = getSourceUsagePolicy(mode === "web_search" ? "web_search" : mode);
  const searchReady = Object.values(searchKeys).some(Boolean);
  const providerReady = health.healthyProviders.length > 0;
  console.log(`${mode}: ${providerReady && searchReady ? "ready" : "configure_provider"}; policy=${JSON.stringify(policy)}; selected=${health.selectedProvider ?? "none"}/${health.selectedModel ?? "none"}`);
}

if (health.healthyProviders.length === 0 || !Object.values(searchKeys).some(Boolean)) {
  console.log("smoke:research-modes completed with configure_provider readiness; pass --require-live-keys to fail on missing live keys.");
}

if (requireLiveKeys && (health.healthyProviders.length === 0 || !Object.values(searchKeys).some(Boolean))) {
  process.exitCode = 1;
} else {
  console.log("smoke:research-modes passed");
}

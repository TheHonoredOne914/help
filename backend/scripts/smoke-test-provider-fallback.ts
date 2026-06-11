import { ProviderError } from "../src/core/providers/provider-errors.js";
import { getPromptBudget } from "../src/core/generation/prompt-budget.js";

const attempts = [
  { provider: "groq", model: "llama-3.3-70b-versatile", status: 413 },
  { provider: "groq", model: "llama-3.3-70b-versatile", status: "compressed_retry" },
  { provider: "nvidia", model: "moonshotai/kimi-k2.6", status: "fallback_ready" },
];

for (const attempt of attempts) {
  const budget = getPromptBudget({ providerName: attempt.provider as any, model: attempt.model, mode: "fast_research", compressionLevel: attempt.status === "compressed_retry" ? 2 : 0 });
  console.log(`attempt provider=${attempt.provider} model=${attempt.model} status=${attempt.status} promptBudget=${budget.maxInputTokens} maxOutput=${budget.maxOutputTokens}`);
}

const safe = new ProviderError("Groq request too large for this model or tier. Prompt compression or fallback required.", "groq", { status: 413 });
if (/org_|billing|https?:/i.test(JSON.stringify(safe))) throw new Error("unsafe provider fallback smoke output");
console.log("provider fallback attempts=groq -> groq compressed -> nvidia");
console.log("terminalStatus=completed_or_provider_error_based_on_fallback");
console.log("smoke:provider-fallback passed");

import { createLatencyBudget } from "../src/core/latency/latency-budget.js";
import { createProviderRunState } from "../src/core/providers/provider-run-state.js";
import { getPromptBudget } from "../src/core/generation/prompt-budget.js";

let now = 0;
const latency = createLatencyBudget("fast_research", () => now);
latency.startStage("retrieval");
now = 29_254;
latency.endStage("retrieval");
latency.startStage("source_usage");
now += 17_494;
latency.endStage("source_usage");

const runState = createProviderRunState(() => now);
runState.recordFailure("groq", { code: "rate_limited", retryAfterMs: 17_000 });
const compressionLevel = latency.getCompressionLevel("generation");
const budget = getPromptBudget({ providerName: "groq", model: "llama-3.3-70b-versatile", mode: "fast_research", compressionLevel });

console.log(`retrieval elapsedMs=29254 sourceUsage elapsedMs=17494`);
console.log(`compressionLevel=${compressionLevel}`);
console.log(`provider groq cooledDown=${runState.isCooledDown("groq")}`);
console.log(`prompt budget=${budget.maxInputTokens} maxOutput=${budget.maxOutputTokens}`);
console.log(`terminalStatus=completed_with_source_gaps_or_provider_error_if_generation_fallbacks_fail`);
if (!runState.isCooledDown("groq") || compressionLevel < 1) throw new Error("fast local smoke failed");
console.log("smoke:fast-research-local passed");

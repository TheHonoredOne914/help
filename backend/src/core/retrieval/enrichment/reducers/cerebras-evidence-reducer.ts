import { buildEnrichmentCard } from "../evidence-card-builder.js";
import { isEvidenceItemVerified } from "../evidence-card-validator.js";
import { emitEnrichmentEvent } from "../telemetry.js";
import { localEvidenceReducer } from "./local-evidence-reducer.js";
import type { EnrichedSource, EnrichmentEvidenceItem, EvidenceReducer, ReducerOptions, ScoredChunk, SourceChunk } from "../types.js";

export const cerebrasEvidenceReducer: EvidenceReducer = {
  name: "cerebras",
  async reduce(source: EnrichedSource, topChunks: ScoredChunk[], query: string, options: ReducerOptions = {}) {
    const config = cerebrasConfig(options);
    if (!config.enabled || !config.apiKey) return fallback(source, topChunks, query, options, "missing_key_or_disabled");
    if (options.abortSignal?.aborted) return fallback(source, topChunks, query, options, "aborted");

    const chunksForModel = topChunks.slice(0, config.maxChunksPerSource);
    const body = {
      model: config.model,
      max_tokens: config.maxTokensPerSource,
      messages: [
        {
          role: "system",
          content: "You are a parliamentary evidence extractor. Return ONLY a JSON array of evidence cards. Each card: { claim: string, snippet: string, relevance: string }. No prose, no markdown, no backticks.",
        },
        {
          role: "user",
          content: `Query: ${query}\n\nSource: ${source.title} (${source.url})\n\nChunks:\n${chunksForModel.map((chunk, index) => `[${index}] ${chunk.text}`).join("\n\n")}\n\nExtract up to ${config.maxCardsPerSource} evidence cards.`,
        },
      ],
    };

    const fetchFn = options.fetchFn ?? fetch;
    let lastReason = "request_failed";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (options.abortSignal?.aborted) return fallback(source, topChunks, query, options, "aborted");
      const response = await fetchFn("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(body),
        signal: options.abortSignal,
      });
      if (response.status === 429) {
        lastReason = "rate_limited";
        await delay((options.cerebrasRetryDelayMs ?? 250) * 2 ** attempt);
        continue;
      }
      if (response.status >= 500) {
        lastReason = `server_${response.status}`;
        await delay((options.cerebrasRetryDelayMs ?? 250) * 2 ** attempt);
        continue;
      }
      if (!response.ok) return fallback(source, topChunks, query, options, `http_${response.status}`);
      try {
        const payload = await response.json() as any;
        const content = payload.choices?.[0]?.message?.content;
        const parsed = JSON.parse(String(content ?? ""));
        if (!Array.isArray(parsed)) return fallback(source, topChunks, query, options, "invalid_schema");
        const originalChunks: SourceChunk[] = chunksForModel.map(({ index, text, charLength, url }) => ({ index, text, charLength, url }));
        const evidenceItems = parsed
          .slice(0, config.maxCardsPerSource)
          .filter(isEvidenceItem)
          .filter((item: EnrichmentEvidenceItem) => isEvidenceItemVerified(item, originalChunks));
        emitEnrichmentEvent("enrichment.cerebras_used", { cards: evidenceItems.length });
        return buildEnrichmentCard(source, chunksForModel, query, { evidenceItems, reducerName: "cerebras" });
      } catch {
        return fallback(source, topChunks, query, options, "invalid_json");
      }
    }
    return fallback(source, topChunks, query, options, lastReason);
  },
};

function cerebrasConfig(options: ReducerOptions) {
  return {
    enabled: options.cerebrasEnabled ?? process.env.CEREBRAS_ENRICHMENT_ENABLED === "true",
    apiKey: options.cerebrasApiKey ?? process.env.CEREBRAS_API_KEY ?? "",
    model: options.cerebrasModel ?? process.env.CEREBRAS_MODEL ?? "llama-3.3-70b",
    maxTokensPerSource: options.cerebrasMaxTokensPerSource ?? numberEnv("CEREBRAS_MAX_TOKENS_PER_SOURCE", 800),
    maxChunksPerSource: options.cerebrasMaxChunksPerSource ?? numberEnv("CEREBRAS_MAX_CHUNKS_PER_SOURCE", 8),
    maxCardsPerSource: options.cerebrasMaxCardsPerSource ?? numberEnv("CEREBRAS_MAX_CARDS_PER_SOURCE", 4),
  };
}

async function fallback(source: EnrichedSource, topChunks: ScoredChunk[], query: string, options: ReducerOptions, reason: string) {
  emitEnrichmentEvent("enrichment.cerebras_fallback", { reason });
  return localEvidenceReducer.reduce(source, topChunks, query, options);
}

function isEvidenceItem(value: unknown): value is EnrichmentEvidenceItem {
  const item = value as EnrichmentEvidenceItem;
  return typeof item?.claim === "string"
    && typeof item?.snippet === "string"
    && typeof item?.relevance === "string"
    && item.claim.trim().length > 0
    && item.snippet.trim().length > 0;
}

function numberEnv(name: string, fallbackValue: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallbackValue;
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

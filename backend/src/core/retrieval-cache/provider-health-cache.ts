import type { ExtractionCooldownState } from "../providers/limits/extraction-cooldown.js";
import { canonicalizeUrl, providerHealthCacheKey } from "./retrieval-cache-key.js";
import { emitProviderCooldown } from "./retrieval-cache-diagnostics.js";
import { retrievalSchemaVersion } from "./retrieval-cache-policy.js";
import { retrievalCacheStore } from "./retrieval-cache-store.js";
import type { RetrievalCacheEmitter } from "./types.js";

interface ProviderHealthEntry {
  provider: "firecrawl" | "jina";
  stage: "extraction";
  timeoutCount: number;
  cooldownUntil?: string;
  jina422Urls?: string[];
}

const COOLDOWN_TTL_MS = 30 * 60 * 1000;
const HISTORY_TTL_MS = 6 * 60 * 60 * 1000;

export function hydrateExtractionCooldown(state: ExtractionCooldownState, options: { emit?: RetrievalCacheEmitter; scope?: string } = {}): ExtractionCooldownState {
  if (!retrievalCacheStore.enabled()) return state;
  for (const provider of ["firecrawl", "jina"] as const) {
    const key = providerHealthCacheKey({ schemaVersion: retrievalSchemaVersion(), provider, stage: "extraction", scope: options.scope });
    const entry = retrievalCacheStore.get<ProviderHealthEntry>("provider_health", key, { allowPartialReuse: true });
    if (!entry) continue;
    const value = entry.value;
    const cooldownActive = Boolean(value.cooldownUntil && Date.parse(value.cooldownUntil) > Date.now());
    if (provider === "firecrawl") {
      if (cooldownActive) {
        state.firecrawlTimeoutCount = Math.max(state.firecrawlTimeoutCount, value.timeoutCount);
        state.firecrawlCooledDown = true;
      }
    } else {
      if (cooldownActive) {
        state.jinaTimeoutCount = Math.max(state.jinaTimeoutCount, value.timeoutCount);
        state.jinaCooledDown = true;
      }
      for (const url of value.jina422Urls ?? []) state.jina422Urls.add(url);
    }
    if (cooldownActive && value.cooldownUntil) {
      emitProviderCooldown(options.emit, { provider, stage: "extraction", cooldownUntil: value.cooldownUntil, active: true });
    }
  }
  return state;
}

export function persistExtractionCooldown(state: ExtractionCooldownState, options: { emit?: RetrievalCacheEmitter; scope?: string } = {}): void {
  if (!retrievalCacheStore.enabled()) return;
  persistProvider("firecrawl", {
    provider: "firecrawl",
    stage: "extraction",
    timeoutCount: state.firecrawlTimeoutCount,
    cooldownUntil: state.firecrawlCooledDown ? new Date(Date.now() + COOLDOWN_TTL_MS).toISOString() : undefined,
  }, options);
  persistProvider("jina", {
    provider: "jina",
    stage: "extraction",
    timeoutCount: state.jinaTimeoutCount,
    cooldownUntil: state.jinaCooledDown ? new Date(Date.now() + COOLDOWN_TTL_MS).toISOString() : undefined,
    jina422Urls: [...state.jina422Urls].map(canonicalizeUrl).slice(-1000),
  }, options);
}

function persistProvider(provider: "firecrawl" | "jina", value: ProviderHealthEntry, options: { emit?: RetrievalCacheEmitter; scope?: string }): void {
  if (!value.timeoutCount && !value.cooldownUntil && !(value.jina422Urls?.length)) return;
  const key = providerHealthCacheKey({ schemaVersion: retrievalSchemaVersion(), provider, stage: "extraction", scope: options.scope });
  const ttlMs = value.cooldownUntil ? Math.max(1000, Date.parse(value.cooldownUntil) - Date.now()) : HISTORY_TTL_MS;
  const entry = retrievalCacheStore.set("provider_health", key, value, { ttlMs });
  if (entry && value.cooldownUntil) {
    emitProviderCooldown(options.emit, { provider, stage: "extraction", cooldownUntil: value.cooldownUntil, active: false });
  }
}

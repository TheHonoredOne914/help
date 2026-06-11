import { createHash } from "node:crypto";
import { allExtractorProviders, allSearchProviders } from "./search-provider-router.js";
import { classifyProviderError, safeProviderError } from "./search-provider-errors.js";
import { multiKeyFetch } from "../../lib/multi-key-fetch.js";
import type { SearchProviderHealth, SearchProviderKeys } from "./search-provider-types.js";

const statusCache = new Map<string, { expiresAt: number; payload: Record<string, SearchProviderHealth> }>();

export async function buildSearchProviderStatus(
  keys: SearchProviderKeys,
  options: { fetchFn?: typeof fetch; timeoutMs?: number; now?: number; bypassCache?: boolean; configuredFrom?: Partial<Record<keyof SearchProviderKeys, "browser" | "server_env" | "none">> } = {},
): Promise<Record<string, SearchProviderHealth>> {
  const cacheKey = searchStatusCacheKey(keys);
  const now = options.now ?? Date.now();
  const cached = statusCache.get(cacheKey);
  if (!options.bypassCache && cached && cached.expiresAt > now) return cached.payload;
  const fetchFn = options.fetchFn ?? multiKeyFetch;
  const providers = [...allSearchProviders(), ...allExtractorProviders()];
  const settled = await Promise.allSettled(providers.map(async (provider) => {
    try {
      const health = provider.healthCheck
        ? await provider.healthCheck(keys, { fetchFn, timeoutMs: options.timeoutMs ?? 6000 })
        : missing(provider.name);
      return [provider.name, { ...health, configuredFrom: configuredFrom(provider.name, keys, options.configuredFrom) }] as const;
    } catch (error) {
      throw { provider: provider.name, error };
    }
  }));
  const payload: Record<string, SearchProviderHealth> = {};
  for (const result of settled) {
    if (result.status === "fulfilled") payload[result.value[0]] = result.value[1];
    else {
      const provider = rejectedProviderName(result.reason);
      const error = rejectedProviderError(result.reason);
      const status = classifyProviderError(error);
      payload[provider] = {
        provider: provider as any,
        configured: isSearchProviderName(provider) ? Boolean(keys[provider]?.trim()) : false,
        configuredFrom: isSearchProviderName(provider) ? configuredFrom(provider, keys, options.configuredFrom) : "none",
        healthy: false,
        status,
        canSearch: false,
        canExtract: false,
        error: safeProviderError(error),
      };
    }
  }
  statusCache.set(cacheKey, { expiresAt: now + 10000, payload });
  return payload;
}

export function searchStatusCacheKey(keys: SearchProviderKeys): string {
  return (["serper", "exa", "tavily", "brave", "firecrawl", "jina", "scraperapi", "zenrows", "scrapingbee", "geekflare"] as const)
    .map((name) => `${name}:${keys[name] ? fingerprint(keys[name] ?? "") : "none"}`)
    .join("|");
}

export function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function missing(provider: string): SearchProviderHealth {
  return { provider: provider as any, configured: false, healthy: false, status: "missing_key", canSearch: false, canExtract: false };
}

function configuredFrom(provider: string, keys: SearchProviderKeys, explicit?: Partial<Record<keyof SearchProviderKeys, "browser" | "server_env" | "none">>): "browser" | "server_env" | "none" {
  const keyName = provider as keyof SearchProviderKeys;
  return explicit?.[keyName] ?? (keys[keyName]?.trim() ? "browser" : "none");
}

function rejectedProviderName(reason: unknown): keyof SearchProviderKeys | "unknown" {
  const provider = typeof reason === "object" && reason !== null && "provider" in reason
    ? String((reason as { provider?: unknown }).provider)
    : "";
  return isSearchProviderName(provider) ? provider : "unknown";
}

function rejectedProviderError(reason: unknown): unknown {
  return typeof reason === "object" && reason !== null && "error" in reason
    ? (reason as { error?: unknown }).error
    : reason;
}

function isSearchProviderName(value: string): value is keyof SearchProviderKeys {
  return value === "serper"
    || value === "exa"
    || value === "tavily"
    || value === "brave"
    || value === "firecrawl"
    || value === "jina"
    || value === "scraperapi"
    || value === "zenrows"
    || value === "scrapingbee"
    || value === "geekflare";
}

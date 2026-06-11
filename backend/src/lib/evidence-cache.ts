import { createHash } from "node:crypto";
import { LRUCache } from "lru-cache";
import type { EvidenceRegistry } from "./types.js";
import { telemetry } from "./telemetry.js";

const REGISTRY_CACHE = new LRUCache<string, EvidenceRegistry>({
  max: 50,
  ttl: 1000 * 60 * 20,
});

export function buildCacheKey(agendaText: string, mode: "web" | "deep", enrichmentVersion = "v0"): string {
  const normalized = agendaText
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2_000);
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 32);
  return `${mode}::${enrichmentVersion}::${digest}`;
}

export function getCachedRegistry(agendaText: string, mode: "web" | "deep", enrichmentVersion = "v0"): EvidenceRegistry | null {
  const result = REGISTRY_CACHE.get(buildCacheKey(agendaText, mode, enrichmentVersion)) ?? null;
  telemetry.increment(result ? "evidence_cache.hit" : "evidence_cache.miss");
  return result;
}

export function setCachedRegistry(agendaText: string, mode: "web" | "deep", registry: EvidenceRegistry, enrichmentVersion = "v0"): void {
  REGISTRY_CACHE.set(buildCacheKey(agendaText, mode, enrichmentVersion), registry);
}

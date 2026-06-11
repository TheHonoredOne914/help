import { redactSecretsDeep } from "../core/security/secret-redaction.js";
import type { ResearchMode } from "../core/config/research-mode.js";
import type { RunCacheTags } from "../core/run-state/types.js";
import { isCacheEntryReusable } from "../core/run-state/cache-run-tags.js";
import { ttlForFreshness as retrievalTtlForFreshness } from "../core/retrieval-cache/retrieval-cache-policy.js";

export type CacheFreshness = "static" | "semi_static" | "fresh";
export type CacheNamespace =
  | "search"
  | "enrichment"
  | "source_score"
  | "evidence_card"
  | "evidence_registry"
  | "evidence_pack"
  | "division_block"
  | "source_profile"
  | "research_angle"
  | "archive_routing"
  | "quality"
  | "provider_health"
  | "academic_search"
  | "academic_resolve_identifier"
  | "academic_metadata"
  | "academic_provider_health"
  | "academic_candidate_to_evidence_flags";

export interface CacheEntry<T> {
  key: string;
  value: T;
  createdAt: string;
  expiresAt: string;
  sourceHash?: string;
  agendaFingerprint?: string;
  mode?: ResearchMode;
  runTags?: RunCacheTags;
}

export interface CacheSetOptions {
  ttlMs?: number;
  freshness?: CacheFreshness;
  sourceHash?: string;
  agendaFingerprint?: string;
  mode?: ResearchMode;
  runTags?: RunCacheTags;
  allowPartialReuse?: boolean;
}

export class CacheManager {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries: number;
  private now: () => number;

  constructor(options: { now?: () => number; maxEntries?: number } = {}) {
    this.now = options.now ?? Date.now;
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 10_000));
  }

  setNow(now: () => number): void {
    this.now = now;
  }

  get<T>(namespace: CacheNamespace, key: string, options: { allowPartialReuse?: boolean } = {}): T | null {
    return this.getEntry<T>(namespace, key, options)?.value ?? null;
  }

  getEntry<T>(namespace: CacheNamespace, key: string, options: { allowPartialReuse?: boolean } = {}): CacheEntry<T> | null {
    const entry = this.entries.get(this.key(namespace, key));
    if (!entry) return null;
    if (new Date(entry.expiresAt).getTime() <= this.now()) {
      this.entries.delete(this.key(namespace, key));
      return null;
    }
    if (!isCacheEntryReusable(entry, options)) return null;
    return entry as CacheEntry<T>;
  }

  set<T>(namespace: CacheNamespace, key: string, value: T, options: CacheSetOptions = {}): CacheEntry<T> {
    this.sweepExpired();
    const ttlMs = options.ttlMs ?? this.ttlForFreshness(options.freshness ?? "fresh");
    const created = new Date(this.now());
    const entry: CacheEntry<T> = {
      key,
      value: redactSecretsDeep(value),
      createdAt: created.toISOString(),
      expiresAt: new Date(created.getTime() + ttlMs).toISOString(),
      sourceHash: options.sourceHash,
      agendaFingerprint: options.agendaFingerprint,
      mode: options.mode,
      runTags: options.runTags,
    };
    this.entries.set(this.key(namespace, key), entry);
    this.evictOverflow();
    return entry;
  }

  ttlForFreshness(freshness: CacheFreshness): number {
    return retrievalTtlForFreshness(freshness);
  }

  stats(): { entries: number } {
    return { entries: this.entries.size };
  }

  delete(namespace: CacheNamespace, key: string): boolean {
    return this.entries.delete(this.key(namespace, key));
  }

  clearNamespace(namespace: CacheNamespace): number {
    const prefix = `${namespace}:`;
    let deleted = 0;
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  private key(namespace: CacheNamespace, key: string): string {
    return `${namespace}:${key}`;
  }

  private evictOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (!oldestKey) break;
      this.entries.delete(oldestKey);
    }
  }

  private sweepExpired(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (new Date(entry.expiresAt).getTime() <= now) {
        this.entries.delete(key);
      }
    }
  }
}

export const globalResearchCache = new CacheManager();

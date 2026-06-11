import { safeDomainKey } from "./safe-url.js";
import type { EvidenceCard } from "./types.js";

export interface DomainDiversityOptions {
  limit: number;
  earlyWindow?: number;
  maxPerDomainEarly?: number;
  maxPerDomain?: number;
}

export function applyDomainDiversity(cards: EvidenceCard[], options: DomainDiversityOptions): EvidenceCard[] {
  const limit = Math.max(0, options.limit);
  const earlyWindow = options.earlyWindow ?? Math.min(12, limit);
  const maxPerDomainEarly = options.maxPerDomainEarly ?? 3;
  const maxPerDomain = options.maxPerDomain ?? 5;
  const out: EvidenceCard[] = [];
  const domainSeen = new Map<string, number>();
  const deferred: EvidenceCard[] = [];

  for (const card of cards) {
    const domain = safeDomainKey(card.url);
    const count = domainSeen.get(domain) ?? 0;
    const cap = out.length < earlyWindow ? maxPerDomainEarly : maxPerDomain;
    if (count >= cap) {
      deferred.push(card);
      continue;
    }
    out.push(card);
    domainSeen.set(domain, count + 1);
    if (out.length >= limit) return out;
  }

  for (const card of deferred) {
    if (out.length >= limit) break;
    const domain = safeDomainKey(card.url);
    const count = domainSeen.get(domain) ?? 0;
    if (count >= maxPerDomain && out.length >= Math.min(earlyWindow, limit)) continue;
    out.push(card);
    domainSeen.set(domain, count + 1);
  }
  return out;
}

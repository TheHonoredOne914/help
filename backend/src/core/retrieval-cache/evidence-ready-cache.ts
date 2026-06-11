import type { EvidenceSource } from "../evidence/evidence-registry.js";
import type { EvidenceCard } from "../evidence/evidence-pack/types.js";
import { evidenceReadyCacheKey } from "./retrieval-cache-key.js";
import { diagnosticFor, emitRetrievalDiagnostic } from "./retrieval-cache-diagnostics.js";
import { extractionContentHash, retrievalSchemaVersion } from "./retrieval-cache-policy.js";
import { retrievalCacheStore } from "./retrieval-cache-store.js";
import type { RetrievalCacheEmitter } from "./types.js";

export function getEvidenceReadyCard(source: EvidenceSource, agendaFingerprint = "global", emit?: RetrievalCacheEmitter): EvidenceCard | null {
  const key = buildEvidenceKey(source, agendaFingerprint);
  if (!key) return null;
  const entry = retrievalCacheStore.get<EvidenceCard>("evidence_card", key);
  if (!entry) return null;
  const contentHash = extractionContentHash(source.fullText ?? source.snippet ?? "");
  if (!contentHash || entry.sourceHash !== contentHash || (entry.agendaFingerprint ?? "global") !== agendaFingerprint) {
    retrievalCacheStore.delete("evidence_card", key);
    emitRetrievalDiagnostic(emit, diagnosticFor("evidence_ready", "stale_skipped", key, { url: source.url, contentHash }));
    return null;
  }
  emitRetrievalDiagnostic(emit, diagnosticFor("evidence_ready", "hit", key, { url: source.url, ageMs: Date.now() - new Date(entry.createdAt).getTime() }));
  return entry.value;
}

export function writeEvidenceReadyCard(source: EvidenceSource, card: EvidenceCard, agendaFingerprint = "global", emit?: RetrievalCacheEmitter): void {
  const key = buildEvidenceKey(source, agendaFingerprint);
  if (!key) return;
  const contentHash = extractionContentHash(source.fullText ?? source.snippet ?? "");
  if (!contentHash) return;
  const entry = retrievalCacheStore.set("evidence_card", key, card, { freshness: "semi_static", sourceHash: contentHash, agendaFingerprint });
  if (entry) emitRetrievalDiagnostic(emit, diagnosticFor("evidence_ready", "write", key, { url: source.url, contentHash }));
}

export function invalidateEvidenceReadyForSource(source: EvidenceSource, agendaFingerprint = "global", emit?: RetrievalCacheEmitter): void {
  const key = buildEvidenceKey(source, agendaFingerprint);
  if (!key) return;
  if (retrievalCacheStore.delete("evidence_card", key)) {
    emitRetrievalDiagnostic(emit, diagnosticFor("evidence_ready", "invalidate", key, { url: source.url }));
  }
}

function buildEvidenceKey(source: EvidenceSource, agendaFingerprint: string): string | null {
  const contentHash = extractionContentHash(source.fullText ?? source.snippet ?? "");
  if (!contentHash) return null;
  return evidenceReadyCacheKey({
    schemaVersion: retrievalSchemaVersion(),
    sourceId: source.id,
    url: source.url,
    contentHash,
    agendaFingerprint,
  });
}

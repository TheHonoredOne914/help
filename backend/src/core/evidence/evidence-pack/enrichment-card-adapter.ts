import type { EvidenceSource } from "../evidence-registry.js";

export function extractEvidenceItems(source: EvidenceSource): unknown[] {
  const value = source.enrichmentCard?.evidenceItems;
  return Array.isArray(value) ? value : [];
}

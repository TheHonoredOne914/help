import { buildEnrichmentCard } from "../evidence-card-builder.js";
import type { EnrichedSource, EvidenceReducer, ReducerOptions, ScoredChunk } from "../types.js";

export const localEvidenceReducer: EvidenceReducer = {
  name: "local",
  async reduce(source: EnrichedSource, topChunks: ScoredChunk[], query: string, _options: ReducerOptions = {}) {
    return buildEnrichmentCard(source, topChunks, query, { reducerName: "local" });
  },
};

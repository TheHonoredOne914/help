# Retrieval Cache

This folder restores BestDel's retrieval cache as L1 in-memory wrappers over the shared `CacheManager`.

Active layers in this checkout:

- `search_result` uses the `search` namespace for bucketed provider results.
- `url_extraction` uses the `enrichment` namespace for enriched source snapshots and short negative entries.
- `provider_health` uses the `provider_health` namespace to persist the existing Jina/Firecrawl cooldown state.
- `normalized_source` uses the `source_score` namespace for canonical dedupe candidates.
- `evidence_ready` uses the `evidence_card` namespace and keys by source ID plus content hash.

The academic layer is represented in types/events/namespaces for compatibility, but this checkout currently has no `backend/src/core/academic` runtime to wire.

Safety rules:

- `RETRIEVAL_CACHE_ENABLED=false` leaves the wrappers as no-ops.
- Cache writes are redacted by `CacheManager`.
- Snippet fallback hits stay `limitedSource` and citation-ineligible.
- Negative extraction entries never become positive entries.
- Evidence cards are keyed by source ID and extraction content hash.
- EvidenceRegistry still allocates source IDs; cache hits do not bypass the registry.

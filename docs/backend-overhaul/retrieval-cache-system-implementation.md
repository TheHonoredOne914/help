# Retrieval Cache System Rebuild

Problem:
The retrieval cache folder, config flags, diagnostics panel, and focused tests had been removed. Search and enrichment fell back to the older direct `CacheManager` hooks only, so provider cooldown and negative extraction reuse were not persisted.

Root cause:
The current checkout contains an older retrieval stack. It has `CacheManager`, `enrichment-cache.ts`, and per-run Jina/Firecrawl cooldown helpers, but no unified retrieval-cache modules or frontend diagnostics.

Files changed:
- `backend/src/config.ts`
- `backend/src/services/cache-manager.ts`
- `backend/src/core/retrieval-cache/*`
- `backend/src/core/retrieval/search-executor.ts`
- `backend/src/core/retrieval/enrichment/*`
- `backend/src/core/retrieval/bucketed-retrieval.ts`
- `backend/src/core/retrieval/source-deduper.ts`
- `backend/src/core/evidence/evidence-pack/evidence-card-adapter.ts`
- `backend/src/core/pipeline/pipeline-events.ts`
- `frontend/src/components/chat/research-pipeline/*`

Fix:
Rebuilt the L1 retrieval cache as typed wrappers over the singleton `CacheManager`, restored cache event types, added search/extraction/provider-health/normalized/evidence-ready helpers, wired cache diagnostics through the existing core pipeline event channel, and added a compact frontend Retrieval Cache panel.

Runtime reasoning:
The wrappers sit on the real search, enrichment, cooldown, dedupe, and evidence-card paths. With `RETRIEVAL_CACHE_ENABLED=false`, they return misses/no-ops. With it enabled, they reuse safe snapshots without changing source usage validation, citation repair, quality gate behavior, or EvidenceRegistry ID allocation.

Verification:
See `backend/tests/retrieval-cache/retrieval-cache-core.test.ts` and `frontend/src/components/chat/research-pipeline/useRetrievalCacheStats.test.ts`.

Remaining risk:
This checkout has no active academic runtime folder, so academic cache integration is limited to namespace/type/event compatibility. The cache is still L1 in-memory and has no global LRU beyond the per-entry byte cap.

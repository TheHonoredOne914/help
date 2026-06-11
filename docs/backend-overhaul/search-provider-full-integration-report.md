# Summary

Implemented Serper, Exa, and Firecrawl as first-class search/retrieval providers across BestDel's frontend key path, backend key extraction, provider status, core retrieval, legacy web search, enrichment, source provenance, pipeline events, smoke scripts, and docs.

# Providers Added

- Serper: preserved and moved to first priority for keyword/news/official/legal discovery.
- Exa: added for semantic source discovery.
- Firecrawl: added as the primary page extraction provider before Jina/snippet fallback.

# Existing Providers Preserved

- Tavily remains a search fallback/comparison provider.
- Jina remains extraction and reranking fallback.
- Brave remains optional search fallback.

# Runtime Paths Wired

- Frontend Settings: `settings-dialog.tsx` now includes Exa and Firecrawl fields and status grid entries.
- Frontend headers: `provider-keys.ts` and the duplicate Settings helper send `X-Exa-Api-Key` and `X-Firecrawl-Api-Key`.
- Backend key extraction: `extractKeys()` reads `X-Exa-Api-Key`, `X-Firecrawl-Api-Key`, `EXA_API_KEY`, and `FIRECRAWL_API_KEY`.
- Provider status: aggregate provider status now includes Serper, Exa, Tavily, Brave, Firecrawl, and Jina with search/extraction capability flags.
- Legacy web_search: `web-search.ts` supports Exa and uses Serper/Exa before Tavily/Brave; `rag.ts` uses Firecrawl before Jina/snippet.
- Core research retrieval: `search-executor.ts` delegates live provider calls through `core/search`, and bucketed retrieval passes Exa/Firecrawl keys.
- Bucketed retrieval: source events include search provider counts and extraction provider breakdown.
- Source enrichment: `source-enrichment.ts` uses Firecrawl -> Jina -> snippet fallback and records extractor attribution.
- Evidence registry metadata: source entries can retain `discoveredBy`, `extractedBy`, and fallback extraction flags.
- Frontend pipeline metadata display: provider runtime panel can display search/extraction providers and snippet fallback count.

# Files Changed

- Backend provider/search: `backend/src/core/search/*`, `backend/src/core/retrieval/search-executor.ts`, `backend/src/core/retrieval/source-enrichment.ts`, `backend/src/core/retrieval/bucketed-retrieval.ts`
- Backend route/key/status: `backend/src/lib/provider-router.ts`, `backend/src/lib/types.ts`, `backend/src/routes/providers.ts`
- Legacy route support: `backend/src/lib/web-search.ts`, `backend/src/lib/rag.ts`, `backend/src/services/anthropic-service.ts`
- Metadata/source provenance: `backend/src/core/evidence/evidence-registry.ts`, `backend/src/core/pipeline/pipeline-metadata.ts`, `frontend/src/lib/pipeline-metadata.ts`
- Frontend keys/status/UI: `frontend/src/lib/provider-keys.ts`, `frontend/src/components/chat/settings-dialog.tsx`, `frontend/src/components/chat/chat-area.tsx`, `frontend/src/hooks/provider-models/*`, `frontend/src/hooks/use-provider-models.tsx`
- Docs/env/smokes/tests: `.env.example`, `backend/scripts/smoke-test-search-*.ts`, `backend/scripts/smoke-test-extraction-fallback.ts`, `backend/scripts/smoke-test-research-retrieval.ts`, `backend/tests/search/*`

# Tests Added

- Backend search key extraction.
- Search result normalization and duplicate provider provenance.
- Search fallback policy.
- Firecrawl/Jina/snippet extraction fallback.
- Core retrieval provider order/provenance.
- Frontend provider key header coverage.
- Source-based frontend regression in `frontend/dev-config.test.mjs`.

# Commands Run

- `npm.cmd run typecheck --prefix backend`
- `npm.cmd test --prefix backend`
- `npm.cmd run build --prefix backend`
- `npm.cmd run typecheck --prefix frontend`
- `npm.cmd test --prefix frontend`
- `npm.cmd run build --prefix frontend`
- `npm.cmd run build`
- `node --import tsx --test ..\frontend\src\lib\provider-keys.test.ts ..\frontend\src\hooks\provider-models\provider-status-normalizer.test.ts`
- `npm.cmd run smoke:search-providers --prefix backend`
- `npm.cmd run smoke:search-fallback --prefix backend`
- `npm.cmd run smoke:extraction-fallback --prefix backend`
- `npm.cmd run smoke:research-retrieval --prefix backend`

# Smoke Results

- Search providers: all search/extraction providers reported `missing_key` in this environment without marking any fallback catalog as healthy.
- Search fallback: all research modes reported no live provider configured instead of fake search success.
- Extraction fallback: no extraction keys were configured, so snippet fallback was reported as expected.
- Research retrieval: mock retrieval produced deterministic results and explicitly reported no live search keys configured.

# Remaining Limitations

- Live health depends on real provider keys; missing keys produce honest missing/skipped statuses.
- Firecrawl search is not enabled; Firecrawl is wired as extraction, which is the requested primary role.
- Provider status can only distinguish browser vs server env by comparing the effective key value available after extraction.

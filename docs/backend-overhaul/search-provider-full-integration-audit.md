# Search Provider Full Integration Audit

Date: 2026-05-23  
Branch: `refactor/modular-files`

## Summary

BestDel already has partial Tavily, Brave, Serper, and Jina support, but the search stack is split across two runtime paths:

- Core research route: `backend/src/services/anthropic-service.ts` calls `runResearchPipeline()`, which calls `runBucketedRetrieval()`, `runSearchPlan()`, `enrichSources()`, and then `buildEvidenceRegistryFromSources()`.
- Legacy web/deep route: `backend/src/services/anthropic-service.ts` can still call `handleMultiSearch()`, which calls `searchWeb()` / `searchWebDeep()` from `backend/src/lib/web-search.ts` and `enrichResults()` from `backend/src/lib/rag.ts`.

Serper exists in both search paths, but ordering is inconsistent and status only checks key presence. Exa is not wired. Firecrawl is not wired. Jina extraction exists, but only as a direct enrichment option rather than as part of a unified extraction provider policy.

## Frontend Provider Key Storage

- `frontend/src/lib/provider-keys.ts`
  - Purpose: shared localStorage contract and request header creation.
  - Current keys: Groq, NVIDIA, Ollama, OpenAI, Gemini, Tavily, Serper, Brave, Jina, OpenRouter, GitHub Models.
  - Known gap: missing `exaApiKey` and `firecrawlApiKey`.
- `frontend/src/components/chat/settings-dialog.tsx`
  - Purpose: Settings modal, localStorage persistence, provider grid, and local duplicate key helpers.
  - Current search fields: Tavily, Serper, Brave, Jina.
  - Known gap: missing Exa and Firecrawl fields; local key type duplicates `provider-keys.ts`.

## Frontend Provider Headers

- `frontend/src/lib/provider-keys.ts`
  - `getProviderHeadersFromKeys()` sends `X-Tavily-Api-Key`, `X-Serper-Api-Key`, `X-Brave-Api-Key`, and `X-Jina-Api-Key`.
  - Known gap: missing `X-Exa-Api-Key` and `X-Firecrawl-Api-Key`.
- `frontend/src/components/chat/settings-dialog.tsx`
  - Contains a duplicate `getProviderHeadersFromKeys()` with the same current gap.
- `frontend/src/components/chat/chat-area.tsx`
  - Uses `getProviderHeaders()` for the actual SSE request to `/api/anthropic/conversations/:id/messages`.

## Frontend Provider Status Display

- `frontend/src/hooks/provider-models/provider-types.ts`
  - Current status providers: model providers plus Tavily, Jina, Brave, Serper.
  - Known gap: missing Exa and Firecrawl.
- `frontend/src/hooks/provider-models/provider-status-normalizer.ts`
  - Normalizes backend provider status values and separates display availability from research usability.
  - Known gap: status enum lacks `timeout` and `status_unknown`; search/extraction capability fields are not represented.
- `frontend/src/components/chat/settings-dialog.tsx`
  - Renders provider status grid from `useProviderModels()`.
  - Known gap: search and extraction providers are not grouped; Exa/Firecrawl missing.

## Frontend Settings Fields

- `frontend/src/components/chat/settings-dialog.tsx`
  - Current fields: Tavily, Serper, Brave, Jina, model-provider keys.
  - Known gap: Exa and Firecrawl are missing.
  - Risk: Tavily has a special `/api/tavily/status` check that is separate from aggregate `/providers/status`, while other search providers rely on the grid.

## Backend Key Extraction

- `backend/src/lib/types.ts`
  - `RequestKeys` includes `tavilyKey`, `serperKey`, `braveKey`, and `jinaKey`.
  - Known gap: missing `exaKey` and `firecrawlKey`.
- `backend/src/lib/provider-router.ts`
  - `extractKeys()` reads search headers and env vars for Tavily, Serper, Brave, Jina.
  - Known gap: missing `X-Exa-Api-Key` / `EXA_API_KEY` and `X-Firecrawl-Api-Key` / `FIRECRAWL_API_KEY`.
  - Existing Serper env fallback uses `SERPER_API_KEY`.

## Backend Provider Status Route

- `backend/src/routes/providers.ts`
  - `/providers/status` uses `buildProviderStatusPayload()`.
  - Model providers are probed with timeouts.
  - Tavily, Jina, Brave, and Serper currently use `simpleKeyStatus()`, which distinguishes missing/configured but does not probe health.
  - `statusCacheKey()` fingerprints keys by SHA-256 slice, not raw keys.
  - Known gap: Exa and Firecrawl missing; search providers do not expose `canSearch` / `canExtract`; configured search keys are labelled `unverified`, not truly healthy.

## Existing Tavily/Jina/Brave/Serper Handling

- `backend/src/core/retrieval/search-executor.ts`
  - Supports live search providers `tavily`, `brave`, and `serper`.
  - Serper endpoint: `https://google.serper.dev/search`.
  - Provider order from configured keys is Tavily, Brave, Serper.
  - Known gap: target order should prefer Serper and Exa before Tavily fallback for fast/web; Exa missing.
- `backend/src/core/retrieval/source-enrichment.ts`
  - Uses Jina Reader when a Jina key exists, otherwise direct readability fetch, then snippet fallback.
  - Known gap: Firecrawl missing and no extractor provider attribution.
- `backend/src/lib/web-search.ts`
  - Legacy search supports Tavily, Serper, Brave, and DuckDuckGo fallback.
  - Active engine currently prefers Tavily, then Serper, then Brave, then DDG.
  - Known gap: Exa missing and target Serper-first policy is not applied.
- `backend/src/lib/rag.ts`
  - `fetchPageContent()` and `enrichResults()` use Jina if configured, then fetch/readability.
  - Known gap: Firecrawl missing from legacy extraction.

## Legacy Web Search Route

- `backend/src/services/anthropic-service.ts`
  - `handleMultiSearch()` calls `searchWeb()` / `searchWebDeep()` and `enrichResults()`.
  - The main request handler still falls back to `handleMultiSearch()` when the core research route is disabled or bypassed.
  - Known gap: legacy route does not receive Exa/Firecrawl keys and cannot use them.

## Core Research Pipeline Retrieval Route

- `backend/src/services/anthropic-service.ts`
  - Core route passes `providerKeys: { tavily, brave, serper, jina }` into `runResearchPipeline()`.
  - Known gap: missing Exa and Firecrawl.
- `backend/src/core/pipeline/research-pipeline.ts`
  - `retrieveLiveSourcesIfNeeded()` calls `runBucketedRetrieval()` with live search options.
- `backend/src/core/retrieval/bucketed-retrieval.ts`
  - Runs search, dedupe, filtering, top-up, multi-hop expansion, enrichment, source-gap reporting.
  - Known gap: provider/extractor runtime metadata is not surfaced in the result.

## Bucketed Retrieval

- `backend/src/core/retrieval/query-planner.ts`
  - Builds bucketed query plan for Indian government, legal, parliamentary, policy, media, academic, and rights sources.
- `backend/src/core/retrieval/bucketed-retrieval.ts`
  - Executes every query against every configured provider.
  - Known gap: no provider strategy by query type; no explicit Serper keyword plus Exa semantic split.

## Query Planner / Top-Up Flow

- `backend/src/core/retrieval/bucketed-retrieval.ts`
  - `buildContextualTopUpQuery()` creates domain-aware top-up queries.
  - Top-up and multi-hop expansion reuse `runSearchPlan()`.
  - Known gap: top-up inherits the same provider list/order and cannot use Exa.

## Source Enrichment / Page Extraction

- `backend/src/core/retrieval/source-enrichment.ts`
  - Jina first when configured; direct fetch otherwise; snippet fallback on failure.
  - Known gap: Firecrawl missing, extractor cooldown/backoff is not explicit, extracted provider metadata is not retained.
- `backend/src/lib/rag.ts`
  - Legacy enrichment uses Jina/fetch and optional Jina reranker.
  - Known gap: Firecrawl missing.

## EvidenceRegistry Source Creation

- `backend/src/core/evidence/evidence-registry.ts`
  - `buildEvidenceRegistryFromSources()` accepts enriched source fields and infers facts, numbers, legal holdings, limitations, citation eligibility.
  - Known gap: `EvidenceSource` has no first-class provider attribution fields, so discovery/extraction provenance is lost before metadata export.

## Source Manifest / Pipeline Metadata

- `backend/src/core/pipeline/pipeline-metadata.ts`
  - Metadata supports sources, provider errors, bucket coverage, quality/citation/source contract.
  - Known gap: no provider runtime summary for search providers used, extraction providers used, fallback extraction count, or provider source breakdown.
- `frontend/src/lib/pipeline-metadata.ts`
  - Mirrors backend metadata for rendering persisted pipeline panels.
  - Known gap: same provider runtime fields missing.
- `frontend/src/components/chat/research-pipeline/ProviderRuntimePanel.tsx`
  - Displays generation provider warnings/errors/fallbacks from events.
  - Known gap: does not display search/extraction providers or fallback extraction counts.

## Smoke Tests

- `backend/package.json`
  - Existing smokes include provider, provider refresh, core research providers, research modes, source usage, retrieval quality.
  - Known gap: no dedicated `smoke:search-providers`, `smoke:search-fallback`, `smoke:extraction-fallback`, or `smoke:research-retrieval`.

## Env Variable Examples / Docs

- `.env.example`
  - Needs explicit `SERPER_API_KEY`, `EXA_API_KEY`, `FIRECRAWL_API_KEY`, `TAVILY_API_KEY`, and `JINA_API_KEY` entries verified/updated.
- Required new report:
  - `docs/backend-overhaul/search-provider-full-integration-report.md`

## Root Cause

The current integration grew in two layers: legacy web search and newer core bucketed retrieval. Serper and Jina were added directly to those layers, while provider status and frontend settings remained partially separate. Because there is no shared search/extraction provider contract, new providers can appear in one layer without being usable or visible end to end.

## Implementation Direction

Add a unified `backend/src/core/search/` layer and adapt existing core retrieval and legacy search/enrichment through it. Preserve Tavily, Jina, Brave, and existing fallback behavior, but make provider order explicit:

- Search: Serper, Exa, Tavily, Brave fallback where configured.
- Extraction: Firecrawl, Jina, snippet fallback.

Provider health must remain honest: missing key is missing, configured but unprobed is not healthy, invalid/rate-limited/network/timeout are separate statuses, and static fallback does not mean healthy.

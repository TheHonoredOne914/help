# Phase 3B Retrieval Search Stabilization Report

## Problem

The retrieval/search layer had a unified search provider router, but the retrieval executor and enrichment path still dropped important search provenance and extraction fallback metadata.

## Root Cause

- URL dedupe in `source-deduper.ts` merged bucket/query metadata but overwrote `discoveredBy`, so duplicate URLs found by Serper and Exa lost cross-provider provenance.
- `runSearchPlan()` called the unified provider router per provider but did not pass the query bucket into provider mode selection, so provider-specific mode routing could not be bucket-aware.
- No-provider live retrieval returned no fake sources, but its diagnostic still reflected the older Tavily/Brave/Serper wording and omitted Exa.
- Extraction fallback returned useful content, but enriched sources did not expose `extractionStatus` or `fallbackExtractionUsed`.
- Firecrawl/Jina response bodies could echo the configured extractor key; generic redaction did not cover every provider key shape, so the search layer needed to redact exact configured key values before reporting failures.

## Search Provider Order

Fast/web retrieval:

1. Serper
2. Exa
3. Tavily fallback
4. Brave remains available after the primary/fallback chain if configured

Deep/PhD/Full retrieval:

1. Serper
2. Exa
3. Tavily fallback/supplementary
4. Brave remains available after that chain if configured

If Serper is missing, Exa still runs. If Exa is missing, Serper still runs. If both are missing, Tavily can run if configured. If none are configured, live retrieval returns no sources and reports a provider failure instead of producing deterministic or fake sources.

## Extraction Provider Order

1. Firecrawl
2. Jina
3. Snippet fallback

Firecrawl failure falls back to Jina. Jina failure falls back to snippet content. Snippet fallback now carries a non-empty safe error when extraction providers fail.

## Provider Provenance Behavior

Every normalized search result keeps `provider`, `query`, `bucketId`, and `retrievedAt`.

Retrieval results now keep both `fetchedAt` and `retrievedAt`, and duplicate URL merges preserve `discoveredBy`, for example `["serper", "exa"]` when the same URL appears from both providers.

Enriched sources now record:

- `extractionProvider`
- `extractionStatus`
- `fallbackExtractionUsed`

## Files Changed

- `backend/src/core/retrieval/search-executor.ts`
- `backend/src/core/retrieval/source-deduper.ts`
- `backend/src/core/retrieval/source-enrichment.ts`
- `backend/src/core/retrieval/bucketed-retrieval.ts`
- `backend/src/core/search/search-provider-router.ts`
- `backend/src/core/search/search-provider-errors.ts`
- `backend/src/core/search/providers/firecrawl-extractor-provider.ts`
- `backend/src/core/search/providers/jina-extractor-provider.ts`
- `backend/tests/search/search-provider-router.test.ts`
- `backend/tests/search/firecrawl-extractor.test.ts`
- `backend/tests/search/search-fallback-policy.test.ts`
- `backend/tests/search/search-result-normalizer.test.ts`
- `backend/tests/retrieval/search-provider-integration.test.ts`
- `backend/tests/retrieval/extraction-fallback-flow.test.ts`
- `backend/tests/retrieval/bucketed-retrieval-live-path.test.ts`

## Tests Added Or Updated

- Added search router coverage for Serper/Exa/Tavily order, Exa-only fallback, and duplicate provenance.
- Added extraction fallback flow coverage for Firecrawl-to-Jina and Jina-to-snippet fallback metadata.
- Updated retrieval integration coverage for no-provider live behavior.
- Updated bucketed retrieval live coverage for cross-provider duplicate URL provenance.

## Runtime Reasoning

The user-facing research path calls bucketed retrieval, which calls `runSearchPlan()`, dedupes raw results, enriches sources, and passes those sources into evidence and answer generation. These changes are in that path:

- `runSearchPlan()` now records provider discovery timestamps and bucket-aware mode context before source scoring.
- URL dedupe preserves the provider discovery list instead of overwriting it.
- Enrichment exposes whether extractor fallback occurred, so downstream metadata can distinguish Firecrawl success, Jina fallback, and snippet-only partial extraction.
- Provider failures remain non-fatal for retrieval but are safe, non-empty, and redacted.

## Verification

Commands run with exit code 0:

- `node --import tsx --test tests/search/search-provider-router.test.ts tests/retrieval/extraction-fallback-flow.test.ts tests/retrieval/search-provider-integration.test.ts tests/retrieval/bucketed-retrieval-live-path.test.ts tests/search/search-fallback-policy.test.ts tests/search/search-result-normalizer.test.ts tests/search/firecrawl-extractor.test.ts`
- `npm.cmd run typecheck --prefix backend`
- `npm.cmd test --prefix backend`
- `npm.cmd run build --prefix backend`
- `npm.cmd run build`

Backend full test result: `333` tests, `328` passed, `5` skipped, `0` failed.

## Remaining Risk

- Live Serper, Exa, Tavily, Firecrawl, and Jina behavior remains gated by real provider keys and rate limits; default tests use mocks and do not spend credits.
- Brave remains in the provider list after the requested Serper/Exa/Tavily path for compatibility, but it was not the focus of this phase.
- Frontend was not touched in this phase; root build validated that frontend still compiles.

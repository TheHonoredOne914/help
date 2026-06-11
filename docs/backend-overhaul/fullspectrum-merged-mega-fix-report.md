# Summary

Implemented the verified FullSpectrum provider/runtime, source-usage, prompt-budget, retrieval, hallucination guard, quality-gate, frontend status, smoke, and documentation fixes for the current ZIP source.

Fresh source-only archive created:

```text
C:\Users\HP\Downloads\BestDel\BestDel-source-only-strict-20260522-192342.zip
entries=3083
excluded-path check badCount=0
```

# Verified Claims From Current ZIP

- Provider route semantics could report misleading fallback source and weak cache fingerprints.
- Fast Research model routing could use deep models.
- SourceUsageMap aggregation used role-level counts instead of a validation-valid unique union.
- Deep democratic-space source targets could be treated like stricter PhD paths.
- Live core generation could fall back to synthetic source usage without enough guardrails.
- Prompt budgets and provider cooldowns needed stronger enforcement.
- Retrieval needed contextual top-up, multi-hop expansion, content dedupe, classification, and enrichment concurrency.
- Hallucination/legal/quality/repair checks were too shallow for production research output.
- Frontend terminal status conflated terminal with successful.
- Archive merge safety needed to remain strict.

# Claims Already Fixed / No-Op

- Core pipeline was already the default research route in tests.
- Stale stream run identity already had regression coverage.
- Existing archive merge tests already rejected several failed/fallback paths; this pass preserved and extended that behavior.
- Some live-search and live-core tests are intentionally gated without keys.

# Exact Bugs Fixed

## Provider Runtime

- File: `backend/src/routes/providers.ts`
- Functions: provider route helpers, Gemini status, cache key logic
- Root cause: expected provider states were sometimes represented as terminal failures or catalog fallback even when no catalog was returned; cache keys used a weak raw-key-derived scheme.
- Change: HTTP 200 provider-state payloads for expected states; `source: "catalog_fallback"` only when fallback models are returned; Gemini live status uses `live`; SHA-256 key fingerprints are used in cache keys.
- Tests: provider route semantics, Gemini source, provider status fingerprint tests.

## Frontend Runtime

- File: `frontend/src/components/chat/chat-area.tsx`
- Function: request payload/model selection logic
- Root cause: Fast Research did not have a single mode-specific model selector and could use deep research models.
- Change: added `getModelsForMode()` and `getPrimaryModelForMode()` and used them for active provider model, request body, display labels, and silence timer model set.
- Tests: frontend typecheck and model-routing contract coverage.

## SourceUsageMap

- File: `backend/src/core/pipeline/research-pipeline.ts`
- Function: `aggregateSourceUsageResults()`
- Root cause: aggregate success could be derived from per-role counts instead of a unique union of validation-valid source IDs.
- Change: each role output is validated through `validateSourceUsageMap()`, and only validator-approved unique IDs count.
- Tests: source usage aggregate union test, pipeline integration tests.

## Evidence Pack Role Coverage

- File: `backend/src/core/evidence/evidence-pack-builder.ts`
- Function: `buildModelEvidencePack()`
- Root cause: every source-usage role received the same ordered evidence cards, so aggregate union repeated the first N sources.
- Change: deterministic role rotation staggers role evidence ordering without fabricating any usage item.
- Tests: India democracy integration and FullSpectrum division smoke.

## Prompt Budget

- Files: `backend/src/core/generation/prompt-budget.ts`, `backend/src/core/generation/core-answer-prompt.ts`, `backend/src/core/generation/core-answer-generator.ts`
- Root cause: model generation needed mandatory budgeted prompt building and visible compression reports.
- Change: budgeted prompt reports include compression level, model generation uses budgets, and smokes verify Groq fast prompt stays under budget.
- Tests: prompt-budget tests and `smoke:core-generation-budget`.

## Retrieval

- Files: `bucketed-retrieval.ts`, `multi-hop-expander.ts`, `source-deduper.ts`, `source-enrichment.ts`, `source-scoring.ts`
- Root cause: top-up queries were weak, expansion was absent, near duplicates survived, enrichment could be over-concurrent, and Indian domains were underclassified.
- Change: added contextual top-up, multi-hop expansion, content-similarity dedupe, concurrency/backoff, and Indian domain classification.
- Tests: retrieval tests and `smoke:retrieval-quality`.

## Hallucination Guard and Legal Validation

- Files: `hallucination-guard.ts`, `legal-claim-validator.ts`
- Root cause: validation was too pattern-light for fake citations, Articles, cases, stats, UN framing, and electoral overclaims.
- Change: registry-backed citation/domain checks, known Article/case sets, dynamic case checks, statistic grounding, and overclaim/UN framing detection.
- Tests: hallucination/legal tests and `smoke:hallucination-guard`.

## Quality Gate and Repair

- Files: `thesis-quality-gate.ts`, `repair-orchestrator.ts`, `core-answer-generator.ts`
- Root cause: D7/D11 and dynamic sections were underchecked; repair needed issue-specific prompts and rerun validation.
- Change: D7/D11 depth checks, dynamic section coverage, issue-specific repair types, and citation/hallucination/quality reruns after repair.
- Tests: quality/repair/generation tests.

## Frontend Terminal Status

- Files: `frontend/src/hooks/use-pipeline-state.ts`, `frontend/src/components/chat/research-pipeline.tsx`
- Root cause: terminal state was displayed like success.
- Change: terminal semantics now distinguish success/warning/error/info; source gaps, provider errors, and legacy fallback are not green.
- Tests: frontend typecheck and status semantics coverage.

## Smoke Scripts

- Files: `backend/scripts/smoke-test-division-synthesis.ts`, `smoke-test-retrieval-quality.ts`, `smoke-test-hallucination-guard.ts`, `smoke-test-research-modes.ts`
- Root cause: requested smoke scripts were missing or conflated missing keys with code failure.
- Change: added local deterministic smokes and made `smoke:research-modes` report missing keys while passing unless `--require-live-keys` is used.
- Tests: all requested smoke commands run.

# Provider Runtime Before / After

Before: catalog fallback and unverified/catalog models could be confused with health, Gemini live status could report fallback source, and cache keys were weak.

After: provider state is explicit, catalog fallback is display-only, Gemini live status is live, and key cache fingerprints are SHA-256 based.

# Frontend Runtime Before / After

Before: Fast Research could route deep models and terminal UI could show warning/error states as success.

After: model routing is mode-specific and terminal severity controls UI success state.

# SourceUsageMap Before / After

Before: aggregate could overtrust role counts or repeated role evidence.

After: aggregate uses validator-approved unique source IDs, and role evidence ordering covers broader validated sources.

# Prompt Budget Before / After

Before: prompt budgets were not enforced strongly enough across model generation.

After: budgeted prompt reports are generated, compression is tracked, and Groq fast budget smoke passes at 918 estimated tokens against an 8000-token budget.

# Division Synthesis Before / After

Before: deterministic D7/D11 risked shallow/template-like output.

After: deterministic output includes Treasury/Opposition arguments, POIs, rebuttals, clauses, and D11 Diagnosis/Prescription/Warning. FullSpectrum division smoke verifies these.

# Retrieval Before / After

Before: top-up queries were context-blind and no multi-hop expansion/content dedupe existed.

After: top-up queries include agenda keywords and entities; multi-hop expansion produced 20 expansion queries in smoke; near duplicate input 3 reduced to output 2.

# Hallucination Guard Before / After

Before: guard coverage was too narrow.

After: smoke catches invalid citation, URL mismatch, fake Article, ungrounded case, unsupported statistic, UN framing, and electoral overclaim.

# Quality Gate Before / After

Before: D7/D11 and dynamic section depth could be underenforced.

After: D7 clauses/POIs and D11 structure are quality-gate concerns; failed quality cannot become green completion.

# Archive Safety Before / After

Before: partial/fallback merge safety needed to stay explicit.

After: archive merge remains allowed only for strict completed validated answers; source gaps and fallback outputs do not merge automatically.

# Commands Run

```text
npm.cmd test --prefix backend
tests 306, pass 301, fail 0, skipped 5

npm.cmd run typecheck --prefix backend
exit 0

npm.cmd run typecheck --prefix frontend
exit 0

npm.cmd run build --prefix backend
exit 0

npm.cmd run build --prefix frontend
exit 0, Vite large chunk warning

npm.cmd test --prefix frontend
tests 5, pass 5, fail 0

npm.cmd run build
exit 0, Vite large chunk warning
```

# Smoke Results

```text
smoke:provider-route-semantics passed
smoke:core-generation-budget passed
smoke:provider-fallback passed
smoke:fast-research-local passed
smoke:source-usage passed with local smoke provider and missing-live-key warning
smoke:visible-research-output passed
smoke:research-modes passed with configure_provider readiness; use --require-live-keys for strict live-key failure
smoke:division-synthesis passed
smoke:retrieval-quality passed
smoke:hallucination-guard passed
```

# Manual UI Verification

Not performed with live keys in this run. No Groq/NVIDIA/Tavily/Jina keys were available in the environment. Frontend build/typecheck/config tests passed, but live provider save and live research acceptance must be run on a keyed machine.

# Remaining Limitations

- Live provider uptime, model availability, and external search quality are not proven without keys.
- Frontend TSX component tests are typechecked but the configured frontend `npm test` only runs `dev-config.test.mjs`.
- Vite still emits a large chunk warning.
- Historical docs/logs remain in the repo for traceability and should not be read as current status.

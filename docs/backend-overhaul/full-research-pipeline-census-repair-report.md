# Full Research Pipeline Census Repair Report

Date: 2026-05-31

Scope: first high-priority repair batch from the full research pipeline bug census. This pass focused on build-blocking contract drift and false-trust runtime states before broader citation/evidence refactors.

## Implementation Notes

### Problem: Backend typecheck failed on source/search contracts

Problem:
`source-normalizer.ts` omitted `general_media` from required `Record<SourceClass, ...>` maps, and `search-provider-errors.ts` returned `aborted` outside the declared search provider status union.

Root cause:
Retrieval scoring had added `general_media`, and enrichment budget abort classification had added `aborted`, but shared type maps were not updated.

Files changed:
- `backend/src/core/evidence/source-normalizer.ts`
- `backend/src/core/search/search-provider-types.ts`
- `backend/tests/retrieval/source-classification-quality.test.ts`
- `backend/tests/retrieval/enrichment-capacity.test.ts`

Fix:
Added `aborted` to `SearchProviderStatusValue`, added explicit `general_media` bucket and score handling, and made unknown evidence domains normalize to `general_media` instead of `policy_research`.

Runtime reasoning:
Unknown web pages no longer get promoted into policy-research evidence, and budget-aborted enrichment can be reported distinctly without breaking typecheck.

Verification:
`npm.cmd run typecheck --prefix backend` passed. Focused retrieval/source tests passed.

Remaining risk:
`general_media` is intentionally low-authority and bucketless; future source selection should continue to prefer specific government, legal, policy, academic, and media classes.

### Problem: Catalog fallback could be treated as usable provider health

Problem:
`isUsableProviderStatus()` returned true for `catalog_fallback` and `unverified`, and GitHub model catalog payloads advertised `canChat: true` without live chat verification.

Root cause:
Model-list display availability and research/chat usability were represented by overlapping fields.

Files changed:
- `backend/src/core/providers/provider-status-contract.ts`
- `backend/src/core/providers/provider-health-policy.ts`
- `backend/src/routes/providers.ts`
- `backend/tests/providers/provider-status-contract-usage.test.ts`
- `backend/tests/providers/provider-health-policy.test.ts`
- `backend/tests/providers/github-model-list.test.ts`

Fix:
Made `healthy` the only usable provider status for research. Catalog/unverified states can still list display models via `canListModels`, but `canChat` and `chatVerified` remain false until live verification succeeds.

Runtime reasoning:
The frontend can show available catalog models without letting the core research path assume generation will work.

Verification:
Focused provider contract tests passed.

Remaining risk:
Live provider acceptance was not run because this pass used mocked provider tests only.

### Problem: SourceUsageMap accepted malformed scope/type data

Problem:
An explicit empty assigned-source set disabled role source enforcement, and unknown usage types were normalized to `supports_claim`.

Root cause:
The validator treated missing and empty scopes the same, and the normalizer tried to salvage unknown schema values as positive usage.

Files changed:
- `backend/src/core/evidence/source-usage/types.ts`
- `backend/src/core/evidence/source-usage/source-usage-normalizer.ts`
- `backend/src/core/evidence/source-usage/role-source-scope.ts`
- `backend/tests/evidence/source-usage/cross-batch-source.test.ts`
- `backend/tests/evidence/source-usage/usage-type-normalizer.test.ts`

Fix:
Added `unknown_invalid` as a sentinel usage type, made unknown usage values fail validation, and made an explicit empty assigned set reject all source references.

Runtime reasoning:
Roles can no longer pass strict source usage by citing sources outside their pack or by typoing usage types into a valid positive class.

Verification:
Focused SourceUsageMap tests passed.

Remaining risk:
Model prompts should still be improved to reduce invalid schema output; this pass only ensures invalid output is rejected honestly.

### Problem: Final status and fallback/scaffold quality could overstate success

Problem:
The service route could ignore a stricter terminal decision unless it carried an error code. Deterministic synthesis scaffolds for non-D7/D11 divisions were marked quality-passed.

Root cause:
Terminal status was split between the pipeline result and route-level decision, and scaffold generation did not distinguish placeholder-safe text from thesis-grade synthesis.

Files changed:
- `backend/src/core/run-state/terminal-status-decider.ts`
- `backend/src/services/anthropic-service.ts`
- `backend/src/core/synthesis/division-quality.ts`
- `backend/tests/run-state/terminal-status-decider.test.ts`
- `backend/tests/synthesis/division-synthesis-orchestrator.test.ts`

Fix:
Added `selectCanonicalRunTerminalStatus()` and routed the service through it. Marked deterministic scaffolds as failed quality with a scaffold issue.

Runtime reasoning:
Source-contract, quality-gate, or fallback downgrades cannot be overwritten by a softer pipeline status, and scaffold text cannot masquerade as complete model synthesis.

Verification:
Focused run-state and synthesis tests passed.

Remaining risk:
Per-division grounding still needs deeper claim/citation validation.

### Problem: Query and bucket planning could drift

Problem:
Democratic-space buckets contained a stale EVM paper-ballot query, foreign-policy official buckets duplicated `government_official` and lost the MOD query, empty legacy planning invented generic PhD queries, and topic-free official/court queries survived validation.

Root cause:
Static query templates and legacy adapters lacked a fail-fast topic-bearing requirement and generic-query rejection.

Files changed:
- `backend/src/core/retrieval/source-buckets.ts`
- `backend/src/services/research-planner.ts`
- `backend/src/core/retrieval/query-planning/query-plan-validator.ts`
- `backend/tests/retrieval/source-buckets.test.ts`
- `backend/tests/retrieval/query-planning/legacy-adapters.test.ts`
- `backend/tests/retrieval/query-planning/query-plan-validator.test.ts`

Fix:
Removed the stale EVM phrase, merged MEA/MOD official foreign-policy queries into one bucket, required a topic-bearing seed before fallback query generation, and filtered topic-free generic official/court queries.

Runtime reasoning:
Retrieval now spends fewer calls on stale or topic-free source discovery, preserving source budget for agenda-specific evidence.

Verification:
Focused source-bucket and query-planner tests passed.

Remaining risk:
The full negative-query corpus from the census is still not complete.

### Problem: Frontend source and metadata display lagged backend contracts

Problem:
Source panel labels still used old `government_india` / `court_judgement` source types, and persisted metadata matching only accepted `assistantMessageId`.

Root cause:
Backend source classes evolved while frontend display helpers and metadata parser stayed backward-compatible only.

Files changed:
- `frontend/src/components/chat/source-panel.tsx`
- `frontend/src/components/chat/research-pipeline.tsx`
- `frontend/src/lib/pipeline-metadata.ts`
- `frontend/src/components/chat/persisted-pipeline.tsx`
- `frontend/src/components/chat/chat-area.tsx`
- `frontend/src/components/chat/source-panel.test.ts`
- `frontend/src/lib/pipeline-metadata.test.ts`

Fix:
Updated badge/tier helpers for backend source classes and extended metadata extraction to accept and enforce `runId + conversationId + assistantMessageId`.

Runtime reasoning:
Source trust labels now match backend structured metadata, and copied/replayed metadata cannot attach to the wrong conversation/run when the expected tuple is supplied.

Verification:
Focused frontend source-panel, metadata, and citation/copy tests passed.

Remaining risk:
Old persisted messages without full identity metadata still parse by available fields for backward compatibility.

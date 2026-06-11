# BestDel Functional Pipeline Repair Report

Date: 2026-06-01

Scope: targeted repair of the minimum functional source-grounded research path from the uploaded bug census. This pass does not attempt all census findings.

## Root Cause Chain

The pipeline failed because the source-to-answer contract was split across loosely connected stages. Query text was normalized inconsistently, topic classification was computed but ignored by legacy fallback planning, source filtering dropped rejection reasons, EvidenceRegistry IDs were not stable after filtering/removal, enrichment could promote weak snippets or malformed URLs, and citation selection could select unsupported fallback sources. Final status could then be softened by frontend/backend desync even when source or quality gates were degraded.

## Repairs

| Area | Files changed | Result |
| --- | --- | --- |
| Query intake and planning | `backend/src/core/pipeline/research-pipeline.ts`, `backend/src/services/research-planner.ts` | One normalized query path; topic-aware fallbacks; no stale topic bleed; acronym-safe planning. |
| Retrieval and source gaps | `backend/src/core/retrieval/source-filter.ts`, `backend/src/core/evidence/source-gap-report.ts` | Rejection diagnostics are preserved and surfaced. |
| Enrichment and timeout safety | `backend/src/core/retrieval/enrichment/*`, `backend/src/core/search/*`, `backend/src/core/providers/*` | Malformed URLs, empty extraction text, invalid Firecrawl key, snippet limitation, cache URL preservation, and abort propagation are handled. |
| Evidence identity and packs | `backend/src/core/evidence/evidence-registry.ts`, `backend/src/core/evidence/evidence-pack/*` | Monotonic source IDs and safe malformed URL pack construction. |
| Source usage and grounding | `backend/src/core/evidence/source-usage/*`, `backend/src/core/synthesis/role-generation/run-role-generation.ts` | Strict source usage remains real; small roles no longer require nine buckets; uppercase Indian acronyms ground correctly; deterministic roles cover more unique evidence without fake usage. |
| Claim/citation chain | `backend/src/core/evidence/claim-ledger.ts`, `backend/src/core/evidence/claim-graph/*`, `backend/src/core/citations/injection/*`, `backend/src/core/citations/repair/*` | ClaimLedger/ClaimGraph drive selection and repair; unsupported citation paths become citation gaps. |
| Synthesis and quality | `backend/src/core/generation/core-answer-generator.ts`, `backend/src/core/generation/core-answer-prompt.ts`, `backend/src/core/quality-gate/*` | Low citations trigger repair before fallback; D7/D11 require meaningful evidence-backed output. |
| Status and frontend state | `backend/src/core/pipeline/final-status.ts`, `backend/src/core/run-state/*`, `frontend/src/lib/run-state/*` | Backend terminal status is canonical; empty answer fails; source gaps/fallback stay warning/error states. |

## Tests Added Or Updated

- `backend/tests/pipeline/functional-pipeline-harness.test.ts`: mocked end-to-end research path with honest terminal status.
- `backend/tests/pipeline/harness/fake-runtime.ts`: deterministic fake runtime providers.
- `backend/tests/retrieval/query-planning/research-planner-regression.test.ts`: topic fallbacks and stale-topic isolation.
- `backend/tests/retrieval/source-filter.test.ts`: malformed URL and rejection diagnostics.
- `backend/tests/retrieval/enrichment/enrich-source-integration.test.ts`: Firecrawl invalid key, snippet limitation, cache/enrichment regressions.
- `backend/tests/evidence/evidence-registry-monotonic-id.test.ts`: monotonic source IDs after filtering/removal.
- `backend/tests/evidence/evidence-pack/safe-url.test.ts`: malformed URL pack safety.
- `backend/tests/citations/injection/no-random-fallback.test.ts`: citation gap instead of random fallback.
- `backend/tests/citations/injection/division-citation-selector.test.ts`: D7 Treasury/Opposition split from claim-supported sources.
- `backend/tests/citations/repair/citation-repair.test.ts`: supported-only repair behavior.
- `backend/tests/quality-gate/brick21-quality-gate-regression.test.ts`, `backend/tests/synthesis/d7-debate-utility-quality.test.ts`, `backend/tests/synthesis/d11-strategic-synthesis-quality.test.ts`: D7/D11 and source-gap gate behavior.
- `backend/tests/run-state/terminal-status-decider.test.ts`: empty answer and canonical terminal status.
- `frontend/src/lib/run-state/__tests__/*`: frontend does not override backend terminal status.

## Verification

- PASS `npm.cmd test --prefix backend`
- PASS `npm.cmd run typecheck --prefix backend`
- PASS `npm.cmd run build --prefix backend`
- PASS `npm.cmd test --prefix frontend`
- PASS `npm.cmd run typecheck --prefix frontend`
- PASS `npm.cmd run build --prefix frontend`
- PASS `npm.cmd run build`
- PASS package-local `npx.cmd tsc -p tsconfig.json --noEmit` from `backend/`
- PASS package-local `npx.cmd tsc -p tsconfig.json --noEmit` from `frontend/`

Note: root-level `npx.cmd tsc -p backend/tsconfig.json --noEmit` and frontend equivalent attempted to fetch `tsc` from the registry and failed under restricted network. The installed local TypeScript binaries and package-local `npx` checks passed.

## Remaining Risks

- No live provider credentials or live search/extraction APIs were used.
- Additional census findings remain outside the minimum functional research path.
- Root-level `npx tsc` remains a workspace tooling issue unless root package TypeScript bin resolution is configured.

## Verdict

Safe to move on for mocked, deterministic end-to-end functional pipeline verification. Live provider verification should be a separate small pass.

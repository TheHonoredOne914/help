# Backend Overhaul Test Failure Analysis

## Initial TDD Red Run

Failure group: new core tests could not load modules.

- Test files: `backend/tests/agenda/agenda-contract.test.ts`, `backend/tests/retrieval/query-planner.test.ts`, `backend/tests/evidence/source-volume-contract.test.ts`, `backend/tests/integration/india-democracy-pipeline.integration.test.ts`.
- Exact failure: missing imports under `backend/src/core/*`, including `claim-graph.js`, `research-pipeline.js`, `source-filter.js`, and `citation-validator.js`.
- Root cause: the planned core adapter architecture did not exist yet in this checkout.
- Implementation files involved: all new `backend/src/core/*` modules.
- Failure category: implementation missing.
- Fix applied: created the core agenda, retrieval, evidence, synthesis, verification, security, streaming, provider, and pipeline modules.
- Regression test added: the new agenda, archive, retrieval, source-volume, citation, security, and integration tests.

## Source Filter Regression

- Test file: `backend/tests/integration/india-democracy-pipeline.integration.test.ts`.
- Failure: fixture sources from trusted domains were filtered too aggressively, dropping below the 30-source contract.
- Root cause: the first source filter allowed too narrow a trusted-domain set.
- Implementation file involved: `backend/src/core/retrieval/source-filter.ts`.
- Failure category: implementation bug.
- Fix applied: expanded trusted India democracy domains and kept older legal precedent sources when relevant.
- Regression test added: integration fixture now enforces 30-source contract and 9+ bucket coverage.

## Claim Graph Rank Detection

- Test file: `backend/tests/evidence/claim-graph.test.ts`.
- Failure: an unsupported rank claim could pass if any number appeared in a source.
- Root cause: number matching was too broad.
- Implementation file involved: `backend/src/core/evidence/claim-graph.ts`.
- Failure category: implementation bug.
- Fix applied: compare the actual extracted rank/number against source key numbers before marking support.
- Regression test added: unsupported rank detection in `claim-graph.test.ts`.

## Quality Gate Electoral Language

- Test file: `backend/tests/integration/india-democracy-pipeline.integration.test.ts`.
- Failure: a caution sentence containing forbidden electoral proof phrasing triggered the guard.
- Root cause: the deterministic synthesis used the phrase as a warning example.
- Implementation file involved: `backend/src/core/pipeline/research-pipeline.ts`.
- Failure category: implementation wording bug.
- Fix applied: replaced proof phrasing with safe language about allegations and evidence thresholds.
- Regression test added: integration test checks no unsupported fraud claim.

## Backend Typecheck Adapter Failures

- Command: `npm run typecheck --prefix backend`.
- Failures:
  - `citation-map.ts`: treated `exportForPrompt()` string as an array.
  - `reranker.ts`: accepted optional titles where scorer requires titles.
  - `sse-events.ts`: called `makePipelineEvent` with reversed argument order.
  - `model-role-runner.ts`: assigned generic number to literal `30`.
  - `repair-orchestrator.ts`: called `repairAgendaDrift` with an obsolete third argument.
- Root cause: thin compatibility adapters were added after the core tests and needed exact type alignment.
- Implementation files involved: the files listed above plus `evidence-registry.ts`.
- Failure category: schema/type mismatch.
- Fix applied: added `getCitationEligibleSources`, narrowed reranker input, fixed event construction, preserved literal 30, and aligned repair call.
- Regression: backend typecheck now passes.

## Final Existing Test Run

- Command: `npm test --prefix backend`.
- Result: 101 tests total, 99 passed, 2 skipped.
- Skipped tests: live web-search quality tests gated by external search API keys.
- Remaining risk: live search variability and API rate limits are still gated outside non-live CI.

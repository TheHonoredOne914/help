# Phase 4A Verification Layer Hardening Report

Date: 2026-05-23
Branch: `phase4/verification-layer-hardening`
Base: `refactor/modular-files`

## Scope

This pass only changes the verification layer and verification tests. It does not wire new behavior into the final research pipeline and does not touch provider runtime, search/retrieval, `research-pipeline.ts`, `core-answer-generator.ts`, or `anthropic-service.ts`.

## Validators Changed

- `backend/src/core/verification/citation-validator.ts`
  - Detects citations to non-existent registry source IDs.
  - Rejects citation URL mismatches using canonical URL comparison instead of host-only matching.
  - Preserves bare citation rejection and now records explicit invalid-citation reasons.
  - Detects repeated linked citations used as source-count inflation.
  - Reports cited source buckets and missing required buckets without inventing coverage.

- `backend/src/core/verification/hallucination-guard.ts`
  - Keeps fake citation, fake Article, unsupported statistic, UN framing, and electoral overclaim checks.
  - Adds unsupported legal holding detection for `held that ...` claims not grounded in registry text.

- `backend/src/core/verification/legal-claim-validator.ts`
  - Keeps known constitutional Article validation, including Article 19(1)(a) through base Article 19 parsing.
  - Supports known Supreme Court cases and dynamic registry-derived case names.
  - Separates `criticalIssues`, `warnings`, and `repairHints`.
  - Treats fake Articles and legal claims without court/legal sources as critical.
  - Treats unknown case names as warning/repair candidates rather than automatic fatal defects.

- `backend/src/core/verification/thesis-quality-gate.ts`
  - Adds explicit `fatalIssues`, `repairRequiredIssues`, and `warningIssues` while preserving existing `automaticFailures` and `warnings` fields.
  - Classifies fake citations, zero valid citations, unsupported electoral fraud claims, UN framing takeover, template/fallback answers, and unsupported source-count claims as fatal.
  - Classifies missing required thesis structure as repair-required.
  - Classifies honest source gaps and weak bucket coverage as warnings.
  - Validates linked citation IDs and URLs against the EvidenceRegistry before accepting quality-gate citation state.

## Repair Prompt Templates

Existing issue-specific repair prompt templates were preserved and covered by tests:

- `citation_repair`
- `legal_accuracy_repair`
- `electoral_caution_repair`
- `un_framing_repair`
- `d11_structure_repair`
- `source_gap_disclosure_repair`

The repair layer still avoids one generic "fix this answer" prompt for every issue.

## Tests Added Or Updated

- Added `backend/tests/verification/citation-validator-hardening.test.ts`
  - Source 99 fails.
  - URL mismatch fails.
  - Repeated citation spam is flagged.
  - Missing bucket coverage is reported.

- Updated `backend/tests/verification/hallucination-guard-real-checks.test.ts`
  - Unsupported case names and unsupported legal holdings are flagged.

- Updated `backend/tests/verification/legal-claim-validator-hardening.test.ts`
  - Article 19(1)(a) remains allowed.
  - Registry-derived case names are allowed.
  - Unknown cases produce warning/repair hints.
  - Fake Article 99 is critical.

- Added `backend/tests/verification/quality-gate-fatality.test.ts`
  - Fake citation is fatal, not warning.
  - UN framing takeover is fatal.
  - Honest source-gap disclosure is warning-level.

- Existing compatibility coverage retained:
  - `backend/tests/verification/citation-validator.test.ts`
  - `backend/tests/evidence/source-volume-contract.test.ts`
  - `backend/tests/retrieval/source-bucket-gates-real.test.ts`

## Implementation Notes

Problem:
The verification layer could reject some invalid citations, but it did not explain fake IDs and URL mismatches clearly, did not flag repeated citation inflation, and quality-gate outcomes mixed fatal, repairable, and warning issues.

Root cause:
Citation validation used host-level matching and a flat rejected-citation list. Legal validation returned one undifferentiated issue list. The quality gate treated many terminal states through `automaticFailures` only, which made downstream severity handling ambiguous.

Files changed:
- `backend/src/core/verification/citation-validator.ts`
- `backend/src/core/verification/hallucination-guard.ts`
- `backend/src/core/verification/legal-claim-validator.ts`
- `backend/src/core/verification/thesis-quality-gate.ts`
- `backend/tests/verification/citation-validator-hardening.test.ts`
- `backend/tests/verification/hallucination-guard-real-checks.test.ts`
- `backend/tests/verification/legal-claim-validator-hardening.test.ts`
- `backend/tests/verification/quality-gate-fatality.test.ts`
- `docs/backend-overhaul/phase4-verification-layer-report.md`

Fix:
The validators now expose stricter issue evidence and severity-specific classifications while keeping existing report fields compatible. URL validation compares canonical URLs. Fake source IDs, repeated citation spam, unsupported legal holdings, fake Articles, unknown cases, and fatal quality-gate defects are covered by targeted tests.

Runtime reasoning:
This is not yet wired into final pipeline decision-making beyond the existing verification calls. The hardened validators improve the correctness of verification reports without changing provider routing, retrieval, or research pipeline execution.

## Verification

Commands run in clean worktree `C:\tmp\bestdel-phase4-verification`:

- `node --import tsx --test tests/verification/citation-validator-hardening.test.ts tests/verification/citation-validator.test.ts tests/retrieval/source-bucket-gates-real.test.ts tests/verification/legal-claim-validator-hardening.test.ts tests/verification/hallucination-guard-real-checks.test.ts tests/verification/repair-orchestrator-specific-prompts.test.ts tests/verification/quality-gate-fatality.test.ts tests/evidence/source-volume-contract.test.ts`
  - Exit code: 0
  - Result: 15 passed, 0 failed

- `npm.cmd run typecheck --prefix backend`
  - Exit code: 0

- `npm.cmd test --prefix backend`
  - Exit code: 0
  - Result: 329 passed, 5 skipped, 0 failed

- `npm.cmd run build --prefix backend`
  - Exit code: 0

- `npm.cmd run build`
  - Exit code: 0
  - Result: backend build passed; frontend production build passed with existing Vite chunk-size warning.

## Remaining Risks

- The new severity fields are verification-layer outputs only; this task intentionally does not wire them into final pipeline status decisions.
- Citation bucket coverage is reported and weak coverage is classified, but source acquisition quality still depends on retrieval and evidence registry behavior outside this task's allowed scope.
- Unknown case detection is conservative and warning-level because Indian case names vary widely; downstream repair should qualify or source them rather than treating every unknown case as fabricated.

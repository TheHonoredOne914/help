# Phase 4B Division Quality Report

Date: 2026-05-23
Branch: phase4/division-quality-hardening
Base: refactor/modular-files

## Scope

This pass stayed inside isolated synthesis/division quality files. It did not touch provider runtime files, search/retrieval files, `backend/src/core/pipeline/research-pipeline.ts`, `backend/src/core/generation/core-answer-generator.ts`, or `backend/src/services/anthropic-service.ts`.

## D1-D11 Current State

| Division | Current state | Runtime usage | Template risk | Action |
| --- | --- | --- | --- | --- |
| D1 Core Brief | Deterministic scaffold in isolated synthesis orchestrator; model/service generation exists elsewhere. | Core answer generator has its own integrated division output path. | Medium if no model text is available. | Documented and included in orchestrator output map. |
| D2 Analytical Dimensions | Deterministic scaffold in isolated synthesis orchestrator. | Integrated runtime path remains outside this task. | Medium. | Documented and included in orchestrator output map. |
| D3 Stakeholder Mapping | Deterministic scaffold in isolated synthesis orchestrator. | Integrated runtime path remains outside this task. | Medium. | Documented and included in orchestrator output map. |
| D4 Conflict Mapping | Deterministic scaffold in isolated synthesis orchestrator. | Integrated runtime path remains outside this task. | Medium. | Documented and included in orchestrator output map. |
| D5 Narrative Analysis | Deterministic scaffold in isolated synthesis orchestrator. | Integrated runtime path remains outside this task. | Medium. | Documented and included in orchestrator output map. |
| D6 Evidence Verification | Deterministic scaffold in isolated synthesis orchestrator. | Integrated runtime path remains outside this task. | Medium. | Documented and included in orchestrator output map. |
| D7 Debate Utility Arsenal | Deterministic synthesis builder plus validator. | Available through synthesis module; core generator integration was intentionally not changed. | High before this pass: generic POIs/rebuttals and missing coalition/red-line checks could pass. | Added strong builder and validator for Treasury, Opposition, POIs, rebuttals, coalition map, red lines, amendment language, and source anchors. |
| D8 Policy Pathways | Deterministic scaffold in isolated synthesis orchestrator. | Integrated runtime path remains outside this task. | Medium. | Documented and included in orchestrator output map. |
| D9 Predictive Analysis | Deterministic scaffold in isolated synthesis orchestrator. | Integrated runtime path remains outside this task. | Medium. | Documented and included in orchestrator output map. |
| D10 Resolution Support | Deterministic scaffold in isolated synthesis orchestrator. | Integrated runtime path remains outside this task. | Medium. | Documented and included in orchestrator output map. |
| D11 Strategic Insights | Deterministic synthesis builder plus validator. | Available through synthesis module; core generator integration was intentionally not changed. | High before this pass: D11 could summarize or repeat earlier divisions. | Added Diagnosis, Prescription, Warning structure and repetition-ratio validation against earlier divisions. |

## D7 Changes

Problem:
D7 quality checks were not available in the isolated synthesis module, and existing utility generation did not expose coalition map, red lines, or source-anchor metadata.

Root cause:
The synthesis helpers were too thin: generic citations and simple arrays could satisfy shape expectations without proving debate usefulness.

Files changed:
- `backend/src/core/synthesis/division-quality.ts`
- `backend/src/core/synthesis/division-synthesis.ts`
- `backend/src/core/synthesis/debate-utility-generator.ts`
- `backend/tests/synthesis/d7-debate-utility-quality.test.ts`

Fix:
Added `buildDebateUtilityDivision()` and `validateD7DebateUtility()`. The validator now checks useful word count, Treasury Bench, Opposition, POI count, rebuttal count, coalition map, red lines, amendment/resolution language, citation anchors, fallback marking, and placeholder text.

Runtime reasoning:
The synthesis module can now reject generic D7 output before it is treated as thesis-grade debate utility. Fallback text is allowed to be useful, but it cannot pass as normal thesis-grade synthesis.

## D11 Changes

Problem:
D11 could look like a summary of D1-D10 instead of a final strategic synthesis.

Root cause:
There was no isolated D11 validator that enforced Diagnosis, Prescription, Warning or compared against earlier division content.

Files changed:
- `backend/src/core/synthesis/division-quality.ts`
- `backend/src/core/synthesis/strategic-synthesis.ts`
- `backend/tests/synthesis/d11-strategic-synthesis-quality.test.ts`

Fix:
Added `buildStrategicInsightsDivision()` and `validateD11StrategicInsights()`. The validator requires Diagnosis, Prescription, Warning, source anchors, useful word count, no placeholder text, and a repetition ratio below the configured threshold.

Runtime reasoning:
D11 must now synthesize strategic consequences from earlier divisions and cannot pass if it simply repeats D1 or D7 language.

## Validators Changed

New validator coverage:
- minimum useful word count
- D7 POI count
- D7 rebuttal count
- D7 coalition/red-line presence
- D7 amendment/resolution language
- D11 Diagnosis/Prescription/Warning
- D11 repetition ratio against earlier divisions
- citation/source anchor presence
- fallback text cannot pass as thesis-grade synthesis
- placeholder output is rejected

## Deterministic Fallback

Problem:
Fallback division text can be misread as a successful model-quality answer.

Root cause:
Fallback status and quality status were not separated in isolated synthesis helpers.

Files changed:
- `backend/src/core/synthesis/division-quality.ts`
- `backend/tests/synthesis/deterministic-division-fallback.test.ts`

Fix:
Added `buildDeterministicDivisionFallback()`. Fallbacks explicitly include the fallback reason, avoid placeholder text, and remain useful but intentionally limited.

Runtime reasoning:
When model generation fails, fallback text can support the user without pretending to be thesis-grade synthesis.

## Tests Added

- `backend/tests/synthesis/d7-debate-utility-quality.test.ts`
- `backend/tests/synthesis/d11-strategic-synthesis-quality.test.ts`
- `backend/tests/synthesis/division-synthesis-orchestrator.test.ts`
- `backend/tests/synthesis/deterministic-division-fallback.test.ts`

Covered cases:
- D7 without POIs fails.
- D7 without rebuttals fails.
- D7 with strong POIs/rebuttals passes.
- D11 without Diagnosis/Prescription/Warning fails.
- D11 that repeats D1 content fails.
- D11 with real synthesis passes.
- deterministic fallback is marked fallback.
- placeholder/fallback output cannot pass as thesis-grade.

## Commands Run

All commands were run from `C:\tmp\bestdel-phase4`.

| Command | Exit code |
| --- | --- |
| `node --import tsx --test tests/synthesis/*.test.ts` | 0 |
| `npm.cmd run typecheck --prefix backend` | 0 |
| `npm.cmd test --prefix backend` | 0 |
| `npm.cmd run build --prefix backend` | 0 |
| `npm.cmd run typecheck --prefix frontend` | 0 |
| `npm.cmd run build --prefix frontend` | 0 |
| `npm.cmd run build` | 0 |

## Remaining Risks

- The integrated core answer generator has its own D7/D11 deterministic output path. This task intentionally avoided `backend/src/core/generation/core-answer-generator.ts`, so full runtime integration of these new isolated synthesis validators remains a follow-up.
- Existing service-level division generation under `backend/src/services/division-engine.ts` was out of production scope for this task. It still has separate validators and repair behavior.
- The new D1-D6 and D8-D10 orchestrator outputs are conservative deterministic scaffolds. They document structure but are not a replacement for model-generated division content.

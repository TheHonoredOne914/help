# Full Backend Bug Sweep Report

## BD-FS-001 - NVIDIA Missing From Core

Severity: High
Files: core provider types, NVIDIA provider, anthropic service
Root cause: NVIDIA was wired only in legacy client code.
Fix: Added core provider and router registration.
Self-check: `nvidia/moonshotai/kimi-k2.6` resolves to provider `nvidia`, native model `moonshotai/kimi-k2.6`.
Verified: yes
Test added: `backend/tests/providers/nvidia-core-provider.test.ts`
Remaining risk: NVIDIA account/model availability.

## BD-FS-002 - Kimi K2.6 Missing From NVIDIA Catalog

Severity: High
Files: `backend/src/routes/providers.ts`
Root cause: Static NVIDIA catalog did not include Kimi and had no live fetch.
Fix: Added Kimi, live `/v1/models` fetch, and fallback source marker.
Verified: yes
Test added: `backend/tests/providers/nvidia-model-list.test.ts`
Remaining risk: Catalog naming can change.

## BD-FS-003 - GitHub Models Missing

Severity: High
Files: GitHub provider/client, provider routes, settings dialog, chat area.
Root cause: No backend or frontend GitHub provider path.
Fix: Added provider, catalog route, key extraction, frontend key field and dropdown.
Verified: yes
Test added: `backend/tests/providers/github-provider.test.ts`, `github-model-list.test.ts`
Remaining risk: Token permissions.

## BD-FS-004 - OpenRouter Env Naming

Severity: Medium
Files: `backend/src/lib/provider-router.ts`
Root cause: `OPENROUTER_KEY` was used in extraction while `.env` used `OPENROUTER_API_KEY`.
Fix: Header > `OPENROUTER_API_KEY` > `OPENROUTER_KEY`.
Verified: yes
Test added: `openrouter-key-resolution.test.ts`
Remaining risk: Invalid keys still return provider errors.

## BD-FS-005 - Model Lists Did Not Refresh After Key Save

Severity: High
Files: settings dialog, chat area.
Root cause: React fetch effect depended on selected model instead of provider key updates.
Fix: Save dispatches `bestdel:provider-keys-updated`; chat refetches provider lists and skips unavailable providers.
Verified: build/typecheck yes; manual real-key UI test not run.
Test added: backend route contract tests; no frontend test setup exists beyond typecheck/build.
Remaining risk: Manual browser testing with live keys.

## BD-FS-006 - SourceUsageMap Batch Validation

Severity: High
Files: `source-usage-map.ts`, `model-role-runner.ts`
Root cause: Batch-level validation applied final broad-bucket requirements to each small batch.
Fix: Broad bucket enforcement requires `requiredCount >= 30`; final validation remains strict.
Verified: yes
Test added/covered: existing source-usage real role test and validation regression tests.
Remaining risk: Weak JSON models can still fail, but failure is surfaced.

## BD-FS-007 - Latency Scattered

Severity: Medium
Files: latency budget, research pipeline, core answer generator.
Root cause: Retrieval/source-usage/generation budgets were independent constants.
Fix: Central budget by mode plus stage events and provider timeout wiring.
Verified: yes
Test added: `latency-budget.test.ts`
Remaining risk: Need more UI polish for latency display.

## BD-FS-008 - Provider Health Was Fragmented

Severity: Medium
Files: provider routes, settings dialog.
Root cause: No unified route for model provider health.
Fix: Added `/api/providers/status` with safe structured statuses.
Verified: yes
Test added: `provider-status.test.ts`
Remaining risk: Search provider validity is not deeply probed.

## BD-FS-009 - Migration Source Clutter

Severity: Medium
Files: migration script, `.gitignore`
Root cause: Cache, browser profile, partial node_modules, and staging folders were not fully excluded.
Fix: Added exclusions and dry-run summary; staging is cleaned automatically.
Verified: yes
Test/check: dry run shows `backend/node_modules.partial_20260517122823`, `.npm-cache`, `node_modules`, dist, logs, DBs excluded.
Remaining risk: New generated folders need future excludes.

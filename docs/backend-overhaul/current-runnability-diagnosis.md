# Current Runnability Diagnosis

Date: 2026-05-18
Workspace: `C:\Users\HP\Downloads\BestDel\bestdel_fixed`

## Summary

The app installs, typechecks, tests, builds, and boots locally. Live research cannot be completed in this machine without provider and search API keys, but the app now reports provider configuration gaps instead of faking successful research.

## Command Results

### `npm install`

Result: pass

Key output:

```text
up to date in 731ms
7 packages are looking for funding
```

### `npm run install:all`

Result: pass

Key output:

```text
> bestdel@1.0.0 install:all
> npm install --prefix backend && npm install --prefix frontend

up to date in 1s
up to date in 2s
```

### `npm run typecheck --prefix backend`

Result: pass

Key output:

```text
> bestdel-backend@1.0.0 typecheck
> tsc -p tsconfig.json --noEmit
```

### `npm test --prefix backend`

Result: pass

Key output:

```text
tests 201
pass 196
fail 0
skipped 5
duration_ms 32858.5942
```

Skipped tests are live-key-gated checks that require real provider/search credentials.

### `npm run build --prefix backend`

Result: pass

Key output:

```text
> bestdel-backend@1.0.0 build
> node ./build.mjs
```

### `npm run typecheck --prefix frontend`

Result: pass

Key output:

```text
> bestdel-frontend@0.0.0 typecheck
> tsc --noEmit
```

Note: an earlier run failed because `rehype-sanitize` was missing from the frontend dependency set. After install/dependency repair, the final typecheck passed.

### `npm run build --prefix frontend`

Result: pass

Key output:

```text
vite v5.4.21 building for production...
2604 modules transformed.
dist/public/index.html                 0.81 kB
dist/public/assets/index-B-BfxH4R.css  196.51 kB
dist/public/assets/index-E5ttbSre.js   948.96 kB
built in 15.32s
```

Build warning: the main frontend bundle is larger than 500 kB after minification. This is a size warning, not a build failure.

### `npm run build`

Result: pass

Key output:

```text
> bestdel@1.0.0 build
> npm run build --prefix backend && npm run build --prefix frontend

> bestdel-backend@1.0.0 build
> node ./build.mjs

> bestdel-frontend@0.0.0 build
> tsc -b && node ./build.mjs
vite v5.4.21 building for production...
2604 modules transformed.
built in 12.34s
```

### `npm run dev`

Result: boots backend and frontend

Probe output:

```json
{
  "backendHealth": 200,
  "frontend": 200,
  "groq": 400,
  "nvidia": 400,
  "ollama": 400,
  "openrouter": 400,
  "gemini": 200
}
```

Dev server output:

```text
backend: Server listening on 0.0.0.0 port 3000
frontend: Local: http://localhost:5173/
```

Frontend dev warning: Vite reports that `optimizeDeps.disabled` is deprecated. It is currently used to avoid the Windows sandbox config-loading failure seen during diagnosis.

## Mode Status

Normal mode: covered by backend route tests and expected to work when a healthy generation provider is configured.

Rhetorics mode: covered by backend route tests and expected to work when a healthy generation provider is configured.

Fast/Web research: policy now targets 10 sources, minimum 3 to proceed, and can complete with source gaps. Without provider/search keys, it reports configuration gaps.

Deep research: policy now targets 20 sources, minimum 8 to proceed, and can complete with source gaps when enough cited evidence exists.

PhD research: remains strict. It fails with `SOURCE_USAGE_VALIDATION_FAILED` if the 30-source source-usage contract cannot be proven.

FullSpectrum: remains strict. It requires the strongest source-usage contract and does not silently downgrade to success.

## Provider Endpoint Status

Observed during `npm run dev` probe:

```text
/api/groq/models -> 400
/api/nvidia/models -> 400
/api/ollama/models -> 400
/api/openrouter/models -> 400
/api/gemini/models -> 200
```

Smoke provider health also reports no configured live provider keys in this local environment:

```text
GEMINI_API_KEY missing
GROQ_API_KEY missing
OPENROUTER_API_KEY missing
No healthy research provider is configured for JSON source-usage tasks.
```

Search key status:

```text
tavily: false
brave: false
serper: false
jina: false
```

## Required Keys

At least one generation provider key is required for live model output:

```text
GEMINI_API_KEY
GROQ_API_KEY
OPENROUTER_API_KEY
```

At least one live retrieval key is required for web/research retrieval:

```text
TAVILY_API_KEY
BRAVE_API_KEY
SERPER_API_KEY
JINA_API_KEY
```

Provider endpoints returning 400 are treated as unhealthy and are not selected for source-usage roles.

## Smoke Results

### `npm run smoke:source-usage --prefix backend`

Result: pass

Key output:

```json
{
  "healthyProviders": ["gemini"],
  "assignedSources": [1, 2, 3, 4, 5, "...", 30],
  "validUsedSources": [1, 2, 3, 4, 5, "...", 30],
  "invalidItems": 0,
  "sourceUsageRequirementSatisfied": true,
  "failureReport": null
}
```

### `npm run smoke:research-modes --prefix backend`

Result: expected configuration failure in this local environment

Key output:

```text
healthyProviders: []
selectedProvider: null
selectedModel: null
Missing keys: GROQ_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY, TAVILY_API_KEY or BRAVE_API_KEY or SERPER_API_KEY or JINA_API_KEY
normal: provider_config_error
rhetorics: provider_config_error
web_search: configure_provider
fast_research: configure_provider
deep_research: configure_provider
phd_level: configure_provider
fullspectrum: configure_provider
```

This is correct behavior with missing keys. It does not fake source usage or mark research complete.

## Database And Source ZIP

`backend/data/chat.db` exists locally as runtime state, but future source packages exclude it.

Current hygiene:

```text
backend/data/*
!backend/data/.gitkeep
backend/data/*.db
backend/data/*.db-*
backend/data/*.sqlite*
```

`backend/data/.gitkeep` is present. `SETUP_ON_NEW_LAPTOP.md` documents that the SQLite database is created automatically on first run and source packages should include `.gitkeep` only.

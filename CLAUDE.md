# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BestDel is an AI-powered Indian Mock Parliament research and debate-preparation web app. Users submit research queries about parliamentary debates, and the system retrieves sources, verifies claims, and generates structured arguments with citations.

## Tech Stack

- Frontend: React + Vite + TypeScript + Tailwind
- Backend: Express + TypeScript (ESM modules)
- AI Providers: Groq, OpenRouter, NVIDIA, Gemini, GitHub Models, Ollama
- Search Providers: Tavily, Jina, Brave, Serper, Exa, Firecrawl

## Common Commands

```bash
# Development
npm run dev                    # Run both frontend and backend
npm run dev --prefix backend   # Backend only
npm run dev --prefix frontend # Frontend only

# Type checking
npm run typecheck --prefix backend
npm run typecheck --prefix frontend

# Testing
npm test --prefix backend
npm test --prefix frontend

# Building
npm run build --prefix backend
npm run build --prefix frontend
npm run build                  # Build both

# Smoke tests (backend)
npm run smoke:core-research --prefix backend
npm run smoke:providers --prefix backend
npm run smoke:provider-fallback --prefix backend
npm run smoke:source-usage --prefix backend
```

## Architecture

### Core Pipeline (`backend/src/core/pipeline/research-pipeline.ts`)

The main entry point for research requests. Flow:

1. **Query Routing** - Route query against workspace archives (`context-router.ts`)
2. **Research Angle Generation** - Generate research angles from query and mode (`research-angle-engine.ts`)
3. **Retrieval** - Bucketed retrieval across sources (`bucketed-retrieval.ts`)
4. **Evidence Building** - Build evidence registry and claim graphs (`evidence-registry.ts`, `claim-graph.ts`)
5. **Source Usage** - Run model roles to determine source usage (`source-usage-map.ts`)
6. **Generation** - Generate answer via core generation or legacy fallback (`core-answer-generator.ts`)
7. **Verification** - Validate citations and thesis quality (`citation-validator.ts`, `thesis-quality-gate.ts`)

### Evidence System

- `evidence-registry.ts` - Central registry of all sources
- `claim-graph.ts` - Graph of claims extracted from sources
- `source-usage-map.ts` - Tracks how each model role used sources
- `evidence-pack-builder.ts` - Builds evidence packs for generation

### Provider System (`backend/src/core/providers/`)

- `provider-router.ts` - Routes requests to healthy providers
- `provider-health.ts` - Tracks provider health/status
- `provider-health-policy.ts` - Defines health policies per provider
- `model-strategy.ts` - Assigns models to research roles

Each provider implements a common interface (`provider-types.ts`). Providers: `groq-provider.ts`, `openrouter-provider.ts`, `nvidia-provider.ts`, `gemini-provider.ts`, `github-provider.ts`, `openai-compatible-provider.ts`.

### Search System (`backend/src/core/search/`)

- `search-provider-router.ts` - Routes search across providers with fallback
- `unified-search-router.ts` - Unified interface for all search providers
- `providers/*.ts` - Individual search providers (Tavily, Jina, Brave, Serper, Exa, Firecrawl)

### Verification System (`backend/src/core/verification/`)

- `citation-validator.ts` - Validates citations against evidence
- `hallucination-guard.ts` - Detects hallucinated claims
- `thesis-quality-gate.ts` - Validates thesis quality
- `legal-claim-validator.ts` - Validates legal claims

### Synthesis System (`backend/src/core/synthesis/`)

- `division-synthesis.ts` - Generates debate divisions from evidence
- `thesis-synthesis.ts` - Synthesizes thesis statements
- `model-role-runner.ts` - Runs model roles for source usage analysis

## Environment

Copy `.env.example` to `.env` and configure API keys. Do not commit `.env` or real API keys.

## Key Contracts

- `agenda-contract.ts` - Defines the research output contract
- `source-contract.ts` - Defines source quality requirements
- `provider-status-contract.ts` - Defines provider status reporting
- `provider-model-route-contract.ts` - Defines model routing semantics
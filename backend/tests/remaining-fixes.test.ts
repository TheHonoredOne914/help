import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");

function readRepoFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("web search deduplicates in-flight requests and gates gov.in fallback", () => {
  const source = readRepoFile("backend/src/lib/web-search.ts");

  assert.match(source, /const inFlight = new Map<string, Promise<SearchResult\[\]>>\(\)/);
  assert.match(source, /async function _doSearchWeb\(/);
  assert.match(source, /async function _doSearchWebDeep\(/);
  assert.match(source, /GOV_IN_APPLICABLE_PATTERN/);
  assert.match(source, /GOV_IN_SKIP_PATTERN/);
  assert.match(source, /const shouldRunGovFallback =/);
});

test("sequential research batches run all planned roles with small model counts", () => {
  const source = readRepoFile("backend/src/routes/anthropic.ts");
  const executeSequentialBatches = source.slice(source.indexOf("async function executeSequentialBatches"));

  assert.doesNotMatch(source, /"indiankanoon "\s*\+\s*q\s*\+\s*" case law"/);
  assert.match(source, /type ResearchRole = "data_analyst" \| "legal_researcher" \| "policy_analyst" \| "current_affairs"/);
  assert.doesNotMatch(executeSequentialBatches, /needsLegalPrecedents && n >= 2/);
  assert.doesNotMatch(executeSequentialBatches, /needsPolicyAnalysis && n >= 3/);
  assert.match(executeSequentialBatches, /batchName: "Current Affairs", role: "current_affairs"/);
  assert.match(executeSequentialBatches, /role === "current_affairs"\s*\?\s*planned\.current_affairs/);
});

test("frontend uses backend citationStatus as the source badge truth", () => {
  const chatArea = readRepoFile("frontend/src/components/chat/chat-area.tsx");
  const runController = readRepoFile("frontend/src/components/chat/use-chat-run-controller.ts");
  const pipelineState = readRepoFile("frontend/src/hooks/use-pipeline-state.ts");
  const researchPipeline = readRepoFile("frontend/src/components/chat/research-pipeline.tsx");
  const sourcePanel = readRepoFile("frontend/src/components/chat/source-panel.tsx");

  assert.match(runController, /citationStatusReceived: false/);
  assert.match(runController, /markCitationStatusReceived/);
  assert.match(runController, /if \(!terminalState\.citationStatusReceived\) \{\s*dispatchPipeline\(\{ type: "SET_CITED_NUMS"/s);
  assert.match(chatArea, /citationStatus=\{pipeline\.citationStatus\}/);
  assert.match(pipelineState, /citedNums: Set<number>/);
  assert.match(pipelineState, /type: "CITATION_STATUS"; status: CitationStatusSummary/);
  assert.match(researchPipeline, /citationStatus\?: CitationStatusSummary \| null/);
  assert.match(researchPipeline, /usedSourceIds=\{citationStatus \? new Set\(citationStatus\.citedSourceIds\) : citedNums\}/);
  assert.match(sourcePanel, /CITED/);
  assert.match(sourcePanel, /UNUSED/);
});

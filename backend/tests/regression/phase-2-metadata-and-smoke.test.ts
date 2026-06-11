import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../..");

test("phase 2 exposes smoke:core-research and its script", () => {
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "backend/package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.equal(
    packageJson.scripts?.["smoke:core-research"],
    "tsx scripts/smoke-test-core-research.ts",
  );
  assert.equal(
    existsSync(resolve(repoRoot, "backend/scripts/smoke-test-core-research.ts")),
    true,
  );
});

test("phase 2 citationStatus metadata includes invalid citations and cited buckets", () => {
  const backendMetadata = readFileSync(resolve(repoRoot, "backend/src/core/pipeline/pipeline-metadata.ts"), "utf8");
  const frontendMetadata = readFileSync(resolve(repoRoot, "frontend/src/lib/pipeline-metadata.ts"), "utf8");
  const anthropicService = readFileSync(resolve(repoRoot, "backend/src/services/anthropic-service.ts"), "utf8");

  for (const source of [backendMetadata, frontendMetadata, anthropicService]) {
    assert.match(source, /invalidCitations/);
    assert.match(source, /citedBuckets/);
  }
});

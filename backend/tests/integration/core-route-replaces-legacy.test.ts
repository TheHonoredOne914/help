import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "..");

test("real research route always uses the core pipeline", () => {
  const service = fs.readFileSync(path.join(root, "backend/src/services/anthropic-service.ts"), "utf8");
  assert.doesNotMatch(service, /USE_CORE_RESEARCH_ROUTE/);
  assert.doesNotMatch(service, /USE_LEGACY_RESEARCH_ROUTE/);
  assert.doesNotMatch(service, /handleMultiSearch/);
  assert.match(service, /if \(isResearchRouteMode\(routeMode\)\)/);
  assert.match(service, /runResearchPipeline\(/);
  assert.match(service, /generationMode:\s*"model"/);
  assert.match(service, /fallbackExplicitlyAllowed:\s*false/);
  assert.match(service, /Research modes must use the core pipeline/);
});

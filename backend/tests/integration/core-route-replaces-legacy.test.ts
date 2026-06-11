import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "..");

test("real research route gates legacy multi-search behind explicit legacy flags", () => {
  const service = fs.readFileSync(path.join(root, "backend/src/services/anthropic-service.ts"), "utf8");
  const coreGate = service.indexOf("USE_CORE_RESEARCH_ROUTE");
  const legacyGate = service.indexOf("USE_LEGACY_RESEARCH_ROUTE");
  const legacyCall = service.indexOf("await handleMultiSearch");
  assert.ok(coreGate > 0);
  assert.ok(legacyGate > coreGate);
  assert.ok(legacyCall > legacyGate);
  assert.match(service, /generationMode:\s*"model"/);
  assert.doesNotMatch(service.slice(coreGate, legacyGate), /handleMultiSearch/);
});

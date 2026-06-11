import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { runTargetedRepair } from "../../src/core/verification/repair-orchestrator.js";

test("legal_accuracy_repair removes unsupported hard legal phrasing", async () => {
  const contract = buildAgendaContract({
    originalUserQuery: "Fast research on Election Commission safeguards",
    outputDepth: "fast_research",
  });

  const repaired = await runTargetedRepair(
    "Article 19 and Article 21 proportionality requires judicial review and Supreme Court doctrine. This court-backed legal claim must stand.",
    contract,
    [],
    "legal_accuracy_repair",
  );

  assert.doesNotMatch(repaired, /\bArticle\s+\d+\b/i);
  assert.doesNotMatch(repaired, /\bSupreme Court doctrine\b/i);
  assert.doesNotMatch(repaired, /\bcourt-backed\b/i);
  assert.doesNotMatch(repaired, /\blegal claim\b/i);
});

test("legal_accuracy_repair removes unsupported case references", async () => {
  const contract = buildAgendaContract({
    originalUserQuery: "Fast research on Election Commission safeguards",
    outputDepth: "fast_research",
  });

  const repaired = await runTargetedRepair(
    "The Supreme Court in Shreya Singhal v. Union of India upheld the claim.",
    contract,
    [],
    "legal_accuracy_repair",
  );

  assert.doesNotMatch(repaired, /\bShreya Singhal\b/i);
  assert.doesNotMatch(repaired, /\bSupreme Court\b/i);
  assert.match(repaired, /\bsource-backed case reference\b/i);
});

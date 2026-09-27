import test from "node:test";
import assert from "node:assert/strict";
import { countProseWords, contentWordCount } from "../../src/core/quality-gate/quality-gate-input.js";
import { runFinalAnswerLengthGate } from "../../src/core/quality-gate/final-answer-length-gate.js";
import { MODE_THRESHOLDS } from "../../src/core/quality-gate/mode-thresholds.js";
import { runTargetedRepair } from "../../src/core/verification/repair-orchestrator.js";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";

test("countProseWords keeps markdown link text and drops URL path tokens", () => {
  const prose = Array.from({ length: 2100 }, (_, i) => `word${i}`).join(" ");
  const cited = Array.from({ length: 50 }, (_, i) =>
    `[Source ${i + 1}](https://eci.gov.in/path/segment/page-${i + 1}/detail.html)`
  ).join(" ");
  const text = `${prose}\n\n${cited}`;
  const counted = countProseWords(text);
  // 2100 prose + 50 * ("Source" + number) = 2200 visible tokens; no URL fragments.
  assert.equal(counted, 2200);
  assert.equal(contentWordCount(text), counted);
});

test("countProseWords strips bare URLs and keeps general markdown link labels", () => {
  const text = [
    "Alpha beta gamma.",
    "See [Election Commission](https://eci.gov.in/very/long/path/report.html) for filings.",
    "Also https://prsindia.org/policy/brief/full-analysis.html and www.example.com/docs/a.",
  ].join(" ");
  assert.equal(countProseWords(text), 10);
});

test("deep length gate does not fail on URL-inflated citation markdown", () => {
  const body = Array.from({ length: 2500 }, (_, i) => `debate${i}`).join(" ");
  const citations = Array.from({ length: 80 }, (_, i) =>
    `[Source ${i + 1}](https://prsindia.org/policy/brief-${i + 1}/full-analysis/long-path/segment.html)`
  ).join(" ");
  const finalText = `${body}\n\n${citations}`;
  // Legacy \\b word tokenizer counted URL path segments and would trip the max.
  const legacyTokenCount = (finalText.trim().match(/\b[\w'-]+\b/g) ?? []).length;
  assert.ok(legacyTokenCount > 3000, `fixture should be legacy-oversize, got ${legacyTokenCount}`);
  assert.ok(countProseWords(finalText) <= 3000);

  const result = runFinalAnswerLengthGate(
    {
      finalText,
      contract: buildAgendaContract({
        requestId: "length-gate-url",
        originalUserQuery: "Deep research on election advertising",
        outputDepth: "detailed",
      }),
      registry: { getSource: () => null } as any,
      input: { mode: "deep_research" } as any,
    },
    MODE_THRESHOLDS.deep_research,
  );
  assert.equal(result.issues.filter((issue) => issue.code === "final_answer_too_long").length, 0);
});

test("deep length gate fails when prose alone exceeds max", () => {
  const finalText = Array.from({ length: 3100 }, (_, i) => `token${i}`).join(" ");
  const result = runFinalAnswerLengthGate(
    {
      finalText,
      contract: buildAgendaContract({
        requestId: "length-gate-over",
        originalUserQuery: "Deep research oversize prose",
        outputDepth: "detailed",
      }),
      registry: { getSource: () => null } as any,
      input: { mode: "deep_research" } as any,
    },
    MODE_THRESHOLDS.deep_research,
  );
  assert.equal(result.issues.filter((issue) => issue.code === "final_answer_too_long").length, 1);
});

test("deep length gate fails when prose is under min", () => {
  const finalText = Array.from({ length: 500 }, (_, i) => `short${i}`).join(" ");
  const result = runFinalAnswerLengthGate(
    {
      finalText,
      contract: buildAgendaContract({
        requestId: "length-gate-under",
        originalUserQuery: "Deep research undersize prose",
        outputDepth: "detailed",
      }),
      registry: { getSource: () => null } as any,
      input: { mode: "deep_research" } as any,
    },
    MODE_THRESHOLDS.deep_research,
  );
  assert.equal(result.issues.filter((issue) => issue.code === "final_answer_too_short").length, 1);
});

test("fast 1000-word floor ignores landscape and ledger but counts source-backed bullets", () => {
  assert.equal(MODE_THRESHOLDS.fast_research.finalAnswerMinWords, 1000);
  const words = (count: number, prefix: string) => Array.from({ length: count }, (_, index) => `${prefix}${index}`).join(" ");
  const body = words(900, "body");
  const landscape = words(400, "land");
  const ledger = words(400, "cite");
  const bullets = words(150, "bullet");
  const ctx = (finalText: string) => ({
    finalText,
    contract: buildAgendaContract({
      requestId: "length-index-sections",
      originalUserQuery: "Fast research parliamentary brief",
      outputDepth: "brief",
    }),
    registry: { getSource: () => null } as any,
    input: { mode: "fast_research" as const },
  });

  const indexesOnly = runFinalAnswerLengthGate(ctx([
    body,
    "## Evidence Landscape",
    landscape,
    "## Citation Ledger",
    ledger,
  ].join("\n\n")), MODE_THRESHOLDS.fast_research);
  assert.equal(indexesOnly.issues.some((issue) => issue.code === "final_answer_too_short"), true);

  const withBullets = runFinalAnswerLengthGate(ctx([
    body,
    "## Evidence Landscape",
    landscape,
    "## Additional Source-Backed Bullets",
    bullets,
    "## Citation Ledger",
    ledger,
  ].join("\n\n")), MODE_THRESHOLDS.fast_research);
  assert.equal(withBullets.issues.some((issue) => issue.code === "final_answer_too_short"), false);
});

test("length_trim_repair reserves room for the trim notice under the cap", async () => {
  const oversized = Array.from({ length: 3200 }, (_, i) => `token${i}`).join(" ");
  const contract = buildAgendaContract({
    requestId: "trim-notice",
    originalUserQuery: "Deep research trim check",
    outputDepth: "detailed",
  });
  const trimmed = await runTargetedRepair(oversized, contract, [], "length_trim_repair", { maxWords: 3000 });
  assert.ok(countProseWords(trimmed) <= 3000, `trimmed answer exceeded cap: ${countProseWords(trimmed)}`);
  assert.match(trimmed, /Trim Notice/);
});

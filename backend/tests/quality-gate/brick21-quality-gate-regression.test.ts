import test from "node:test";
import assert from "node:assert/strict";
import { decideFinalResearchStatus } from "../../src/core/pipeline/final-status.js";
import { evaluateRepairConvergence } from "../../src/core/quality-gate/repair-convergence-gate.js";
import {
  buildPassingAnswer,
  createQualityGateHarnessFixture,
  runHarnessQualityGate,
} from "./harness/fixtures.js";
import {
  expectFatalIssue,
  expectGateFail,
  expectGatePass,
  expectTelemetry,
} from "./harness/assertions.js";

test("BUG-21-04: sourceGapReport never bypasses hallucination, legal, electoral, framing, or quality failures", () => {
  const { contract, registry, input } = createQualityGateHarnessFixture({ mode: "deep_research" });
  const text = `${buildPassingAnswer(registry)}

## Unsafe Overclaim
The election was rigged and EVMs were compromised as established fact. Article 999 creates a court-ordered right. Member states should adopt a UN resolution.`;
  const report = runHarnessQualityGate(text, contract, registry, {
    ...input,
    sourceGapReport: { explanation: "Several buckets were thin." },
  });

  expectGateFail(report, "BUG-21-04");
  expectFatalIssue(report, "source_gap_bypass");
  expectFatalIssue(report, "electoral_integrity");
  expectFatalIssue(report, "legal_accuracy");
  expectFatalIssue(report, "parliament_framing");
});

test("BUG-21-01: fake citation-looking text fails when final claims lack ClaimGraph or ClaimLedger support", () => {
  const { contract, registry, input } = createQualityGateHarnessFixture({ mode: "deep_research" });
  const text = `${buildPassingAnswer(registry, "deep_research")}

## Unsupported Claim
India secretly invalidated forty million votes in 2026 and every court confirmed the fraud. ${registry.getCitationMarkdown(1)}`;
  const report = runHarnessQualityGate(text, contract, registry, {
    ...input,
    claimGraph: { claims: [], counterclaims: [], contradictions: [], unsupportedClaims: [] },
    claimLedger: { items: [], discardedClaims: [], summary: { itemCount: 0, sourceCount: 0, citationCreditEligibleCount: 0, lowConfidenceCount: 0, roles: [] } },
  } as any);

  expectGateFail(report, "BUG-21-01");
  expectFatalIssue(report, "claim_grounding_traceability");
});

test("BUG-21-02: empty division sidecar outputs no longer fail QG when final answer is substantive", () => {
  const { contract, registry, input } = createQualityGateHarnessFixture({ mode: "deep_research", sourceCount: 45 });
  const divisionOutputs = new Map(input.divisionOutputs as any);
  for (const id of ["D1", "D2", "D3", "D4", "D5", "D6", "D8", "D9", "D10"]) {
    divisionOutputs.set(id, "");
  }
  const report = runHarnessQualityGate(buildPassingAnswer(registry, "deep_research"), contract, registry, {
    ...input,
    divisionOutputs,
  } as any);

  expectGatePass(report);
});

test("BUG-21-05: debate utility POIs live in final answer text, not division sidecar", () => {
  const { registry } = createQualityGateHarnessFixture({ mode: "deep_research" });
  const text = buildPassingAnswer(registry);
  assert.match(text, /POI \d+:/);
  assert.match(text, /Treasury Bench/);
  assert.match(text, /Opposition/);
});

test("BUG-21-06: strategic synthesis must appear in final answer, not only division sidecar", () => {
  const { contract, registry, input } = createQualityGateHarnessFixture({ mode: "deep_research" });
  const good = buildPassingAnswer(registry);
  assert.match(good, /Diagnosis:/);
  assert.match(good, /Prescription:/);
  assert.match(good, /Warning:/);
  const thin = good.replace(
    /# Final Strategic Synthesis[\s\S]+$/,
    "# Final Strategic Synthesis\nThis is a short generic summary.",
  );
  const report = runHarnessQualityGate(thin, contract, registry, input);
  expectGateFail(report, "BUG-21-06");
});

test("BUG-21-07: fast_research and deep_research use different source-depth thresholds", () => {
  const fast = createQualityGateHarnessFixture({ mode: "fast_research", sourceCount: 40 });
  const phd = createQualityGateHarnessFixture({ mode: "deep_research", sourceCount: 40 });

  expectGatePass(runHarnessQualityGate(buildPassingAnswer(fast.registry, "fast_research"), fast.contract, fast.registry, fast.input));
  const phdReport = runHarnessQualityGate(buildPassingAnswer(phd.registry, "deep_research"), phd.contract, phd.registry, phd.input);
  expectGateFail(phdReport, "BUG-21-07");
  expectFatalIssue(phdReport, "mode_depth");
});

test("BUG-21-08 and BUG-21-20: fallback and deterministic fallback cannot become completed through template quality", () => {
  const sourceContract = {
    requiredSources: 10,
    citationEligibleSources: 10,
    finalUniqueCitedSources: 10,
    passedStrict: true,
    passedWithSourceGaps: false,
    passed: true,
    status: "passed" as const,
    reason: "Enough citations.",
  };

  assert.equal(decideFinalResearchStatus({
    mode: "deep_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    degradedFallbackUsed: true,
    sourceContract,
    qualityGate: { passed: true, score: 90, repairRequired: false, fatalIssues: ["deterministic_fallback_template"] } as any,
    citationStatus: { finalUniqueCitedSources: 10 },
  }), "legacy_fallback_used");
});

test("BUG-21-10: cross-division sidecar recycling gate removed; final answer quality remains authoritative", () => {
  const { contract, registry, input } = createQualityGateHarnessFixture({ mode: "deep_research", sourceCount: 45 });
  const report = runHarnessQualityGate(buildPassingAnswer(registry), contract, registry, input);
  expectGatePass(report);
});

test("BUG-21-11 and BUG-21-03: post-repair validation requires quality improvement, not text changes", () => {
  const before = { passed: false, score: 78, automaticFailures: ["legal_accuracy"], warnings: ["thin"], fatalIssues: [], repairRequiredIssues: ["legal_accuracy"], categoryScores: {}, warningIssues: ["thin"], repairRequired: true };
  const after = { passed: false, score: 60, automaticFailures: ["legal_accuracy", "parliament_framing"], warnings: ["thin"], fatalIssues: ["parliament_framing"], repairRequiredIssues: ["legal_accuracy"], categoryScores: {}, warningIssues: ["thin"], repairRequired: true };
  const report = evaluateRepairConvergence({ beforeReport: before, afterReport: after, previousText: "old", repairedText: "new text" });

  assert.equal(report.accepted, false);
  assert.equal(report.changed, true);
  assert.ok(report.reasons.some((reason) => /worse|no quality improvement/i.test(reason)));
});

test("BUG-21-12 and BUG-21-16: electoral variants fail, and absence is not rewarded for electoral topics", () => {
  const { contract, registry, input } = createQualityGateHarnessFixture({ mode: "deep_research" });
  const report = runHarnessQualityGate(`${buildPassingAnswer(registry)}\n\nEVMs cannot be trusted and counting was manipulated.`, contract, registry, input);

  expectGateFail(report, "BUG-21-12");
  expectFatalIssue(report, "electoral_integrity");

  const silentReport = runHarnessQualityGate(buildPassingAnswer(registry).replace(/Election Commission|election|electoral/gi, "institutional"), contract, registry, input);
  assert.ok(silentReport.categoryScores.electoralCaution < 10);
});

test("BUG-21-13: one parliamentary keyword in long output does not pass framing density", () => {
  const { contract, registry, input } = createQualityGateHarnessFixture({ mode: "deep_research" });
  const filler = Array.from({ length: 600 }, () => "generic policy sentence").join(" ");
  const report = runHarnessQualityGate(`${filler}\nTreasury Bench\n${registry.sources.slice(0, 30).map((source) => registry.getCitationMarkdown(source.id)).join(" ")}`, contract, registry, input);

  expectGateFail(report, "BUG-21-13");
  expectFatalIssue(report, "parliament_framing");
});

test("BUG-21-14 and BUG-21-22: snippet-dominated or bucket-concentrated source sets fail source quality", () => {
  const snippet = createQualityGateHarnessFixture({ mode: "deep_research", sourceCount: 45, snippetOnly: true });
  const concentrated = createQualityGateHarnessFixture({ mode: "deep_research", sourceCount: 45, concentratedBucket: true });

  expectFatalIssue(runHarnessQualityGate(buildPassingAnswer(snippet.registry), snippet.contract, snippet.registry, snippet.input), "source_quality");
  expectFatalIssue(runHarnessQualityGate(buildPassingAnswer(concentrated.registry, "deep_research"), concentrated.contract, concentrated.registry, concentrated.input), "bucket_concentration");
});

test("BUG-21-15: legal accuracy does not get full score for keyword-only court/legal mentions", () => {
  const { contract, registry, input } = createQualityGateHarnessFixture({ mode: "deep_research" });
  const text = `${buildPassingAnswer(registry)}\n\nThe court legal court legal phrase is mentioned without a verified Article or holding.`;
  const report = runHarnessQualityGate(text, contract, registry, {
    ...input,
    claimGraph: { claims: [], counterclaims: [], contradictions: [], unsupportedClaims: [] },
    claimLedger: { items: [], discardedClaims: [], summary: { itemCount: 0, sourceCount: 0, citationCreditEligibleCount: 0, lowConfidenceCount: 0, roles: [] } },
  } as any);

  assert.ok(report.categoryScores.legalAccuracy < 10);
});

test("BUG-21-18: final status uses typed fatalIssues rather than regex over failure strings", () => {
  const sourceContract = {
    requiredSources: 20,
    citationEligibleSources: 20,
    finalUniqueCitedSources: 20,
    passedStrict: true,
    passedWithSourceGaps: false,
    passed: true,
    status: "passed" as const,
    reason: "Strict target met.",
  };

  assert.equal(decideFinalResearchStatus({
    mode: "deep_research",
    coreGenerationUsed: true,
    legacyFallbackUsed: false,
    sourceContract,
    qualityGate: { passed: true, score: 91, repairRequired: false, fatalIssues: ["typed_fatal_without_regex_keyword"] } as any,
    citationStatus: { finalUniqueCitedSources: 20 },
  }), "failed");
});

test("BUG-21-19: thesis quality gate emits telemetry", () => {
  const { contract, registry, input } = createQualityGateHarnessFixture({ mode: "deep_research" });
  const report = runHarnessQualityGate(buildPassingAnswer(registry), contract, registry, input);

  expectTelemetry(report);
});

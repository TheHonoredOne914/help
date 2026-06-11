import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { runThesisQualityGate } from "../../src/core/verification/thesis-quality-gate.js";

function baseFixture() {
  const contract = buildAgendaContract({
    originalUserQuery: "India electoral integrity Article 19 parliamentary accountability",
    outputDepth: "deep_research",
  });
  contract.minimumUniqueCitedSources = 2;
  const registry = buildEvidenceRegistryFromSources([
    {
      title: "Election Commission safeguards",
      url: "https://eci.gov.in/vvpat",
      snippet: "The Election Commission explains VVPAT safeguards.",
      sourceClass: "electoral_body",
      bucketIds: ["electoral_integrity", "government_official"],
    },
    {
      title: "Supreme Court Article 19 judgment",
      url: "https://sci.gov.in/article-19",
      snippet: "The Supreme Court considered Article 19 restrictions.",
      sourceClass: "court_primary",
      bucketIds: ["court_legal"],
    },
  ] as any, contract);
  const input = {
    uniqueCitedSourceIds: [1, 2],
    citedBucketIds: ["electoral_integrity", "court_legal"],
    modelRoleOutputs: [],
  };
  return { contract, registry, input };
}

test("quality gate classifies fake citations as fatal rather than warning", () => {
  const { contract, registry, input } = baseFixture();

  const report = runThesisQualityGate(
    "## Executive Thesis\nIndia claim [Source 99](https://fake.example). Treasury Bench and Opposition should debate POIs, rebuttals, motions, and amendments.\n\n## Methodology and Source Base\nUses sources.\n\n## Indian Mock Parliament Debate Utility Arsenal\nTreasury Bench:\n1. A\n2. B\n3. C\nOpposition:\n1. A?\n2. B?\n3. C?\nPOIs? More?\n\n## Final Strategic Synthesis\nDiagnosis: x\nPrescription: y\nWarning: z",
    contract,
    registry,
    input,
  );

  assert.equal(report.passed, false);
  assert.ok(report.fatalIssues.some((issue) => /fake citations/i.test(issue)));
  assert.equal(report.warnings.some((issue) => /fake citations/i.test(issue)), false);
});

test("quality gate treats disclosed source gaps as warning and UN takeover as fatal", () => {
  const { contract, registry } = baseFixture();

  const report = runThesisQualityGate(
    "## Executive Thesis\nMember states should pass a UN resolution while source gaps are disclosed [Source 1](https://eci.gov.in/vvpat).\n\n## Methodology and Source Base\nSource gap disclosed.\n\n## Indian Mock Parliament Debate Utility Arsenal\nTreasury Bench:\n1. A\n2. B\n3. C\nOpposition:\n1. A?\n2. B?\n3. C?\nPOIs? More?\n\n## Final Strategic Synthesis\nDiagnosis: x\nPrescription: y\nWarning: z",
    contract,
    registry,
    {
      uniqueCitedSourceIds: [1],
      citedBucketIds: ["electoral_integrity"],
      modelRoleOutputs: [],
      sourceGapReport: { missing: ["court_legal"] },
    },
  );

  assert.equal(report.passed, false);
  assert.ok(report.fatalIssues.some((issue) => /UN framing takeover/i.test(issue)));
  assert.ok(report.warnings.some((issue) => /source gap/i.test(issue)));
});

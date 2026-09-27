import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { runSafetyQualityGate } from "../../src/core/quality-gate/safety-quality-gate.js";
import { runHarnessQualityGate } from "../quality-gate/harness/fixtures.js";

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

  const report = runHarnessQualityGate(
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

  const report = runHarnessQualityGate(
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

test("a single UN mention is not fatal when parliamentary terms dominate", () => {
  const registry = { sources: [], getSourcesByClass: () => [] } as any;
  const contract = {
    committeeSystem: "indian_mock_parliament",
    originalUserQuery: "parliamentary floor strategy",
  } as any;
  const input = { claimGraph: null, claimLedger: null };
  const singleMention = runSafetyQualityGate({
    finalText: "The Treasury Bench and the Opposition in the Lok Sabha and the Rajya Sabha moved a motion and an amendment, raised a POI, offered a rebuttal, and set floor strategy through committee and a parliamentary question on federalism and the Union ministry in AIPPM. One reference to member states does not take over the floor.",
    contract,
    registry,
    input,
  });
  assert.equal(singleMention.issues.some((issue) => issue.severity === "fatal" && /UN framing takeover|UN-style framing/i.test(issue.message)), false);

  const dominated = runSafetyQualityGate({
    finalText: "Member states passed a UN resolution in the Security Council and the General Assembly through ECOSOC while the international community must follow bloc politics. The Treasury Bench noted a motion.",
    contract,
    registry,
    input,
  });
  assert.ok(dominated.issues.some((issue) => issue.severity === "fatal" && /UN framing takeover/i.test(issue.message)));

  const legal = runSafetyQualityGate({
    finalText: "The Supreme Court held that the statute is unconstitutional.",
    contract,
    registry,
    input,
  });
  assert.ok(legal.issues.some((issue) => issue.code === "legal_accuracy" && issue.severity === "fatal"));
});

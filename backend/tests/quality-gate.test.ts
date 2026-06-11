import assert from "node:assert/strict";
import { test } from "node:test";

import { buildEvidenceRegistry } from "../src/lib/evidence-registry.ts";
import { runDimensionEngine } from "../src/lib/dimension-engine.ts";
import { runQualityGate } from "../src/lib/quality-gate.ts";
import type { EnrichedResult } from "../src/lib/types.ts";

const engine = runDimensionEngine("Article 21 privacy and surveillance", "constitutional");

function registryWithCourt() {
  const result: EnrichedResult = {
    title: "Maneka Gandhi v Union of India",
    url: "https://indiankanoon.org/doc/1766147/",
    snippet: "Article 21 judgement",
    engine: "indiankanoon",
    score: 1,
    sourceType: "court_judgement",
    content: "Full text ".repeat(80),
    judgement: {
      isJudgement: true,
      caseName: "Maneka Gandhi v. Union of India",
      caseNumber: "",
      year: "1978",
      court: "Supreme Court of India",
      bench: "",
      held: "Article 21 procedure must be fair, just and reasonable.",
      relevance: "",
      url: "https://indiankanoon.org/doc/1766147/",
    },
  };
  return buildEvidenceRegistry([result], "Article 21 privacy");
}

test("generic opening language fails parliamentary register check", () => {
  const report = runQualityGate("DIVISION 1 - CORE BRIEF LAYER\nIn the context of Indian democracy, this is a complex issue.", engine, registryWithCourt());

  assert.equal(report.divisionReports[0].parliamentaryRegister, false);
  assert.ok(report.warnings.some((warning) => warning.includes("DIVISION 1")));
});

test("short critical divisions create critical failures", () => {
  const report = runQualityGate("DIVISION 7 - DEBATE UTILITY ARSENAL\nArgument.", engine, registryWithCourt());

  assert.equal(report.passed, false);
  assert.ok(report.criticalFailures.some((failure) => failure.includes("DIVISION 7")));
});

test("division seven requires an operational POI bank", () => {
  const content = [
    "DIVISION 7 - DEBATE UTILITY ARSENAL",
    "When opposition argues privacy blocks security, respond with Article 21 proportionality [Source 1](https://indiankanoon.org/doc/1766147/).",
    "Would the delegate explain why this position ignores Supreme Court safeguards?",
  ].join("\n");
  const report = runQualityGate(content, engine, registryWithCourt());

  assert.ok(report.criticalFailures.some((failure) => failure.includes("POIs")));
});

test("uncited court judgements create a warning", () => {
  const report = runQualityGate("DIVISION 1 - CORE BRIEF LAYER\nArticle 21 requires fair procedure [Source 1](https://indiankanoon.org/doc/1766147/).", engine, registryWithCourt());

  assert.ok(report.warnings.some((warning) => warning.includes("court judgements")));
});

test("high-quality division output scores above eighty", () => {
  const section = [
    "Article 21 of the Constitution requires a committee to treat surveillance as a constitutional design problem, not a technology procurement problem [Source 1](https://indiankanoon.org/doc/1766147/).",
    "The Supreme Court, High Court practice, Lok Sabha oversight, Rajya Sabha scrutiny, MEA diplomatic risk, CAG audit discipline, NCRB data and RBI data each create named institutional constraints.",
    "The argument supports a rights-preserving position, anticipates rebuttal, frames POI pressure, and identifies coalition leverage through constitutional and governance dimensions.",
  ].join(" ").repeat(45);
  const output = Array.from({ length: 11 }, (_, i) => `DIVISION ${i + 1} - TEST\n${section}`).join("\n\n");
  const report = runQualityGate(output, engine, buildEvidenceRegistry([], "Article 21 privacy"));

  assert.ok(report.overallScore > 80);
});

test("division seven with fourteen POIs triggers critical failure", () => {
  const pois = Array.from({ length: 14 }, (_, index) =>
    `Would the honourable delegate explain point ${index + 1}? [Source 1](https://indiankanoon.org/doc/1766147/).`
  ).join("\n");
  const content = [
    "DIVISION 7 - DEBATE UTILITY ARSENAL",
    "When opposition argues privacy blocks security, respond with Article 21 proportionality [Source 1](https://indiankanoon.org/doc/1766147/).",
    pois,
  ].join("\n");
  const report = runQualityGate(content, engine, registryWithCourt());

  assert.ok(report.criticalFailures.some((failure) => failure.includes("14 POIs")));
});

test("section detection supports markdown heading formats", () => {
  for (const heading of ["## DIVISION 7 - DEBATE UTILITY ARSENAL", "**DIVISION 7**", "# Division 7"]) {
    const content = [
      heading,
      "Would the delegate answer? ".repeat(15),
      "When opposition argues privacy blocks security, respond with Article 21 proportionality. ".repeat(5),
    ].join("\n");
    const report = runQualityGate(content, engine, registryWithCourt());
    const divisionSeven = report.divisionReports.find((division) => division.divisionId === "debate_utility");

    assert.ok(divisionSeven);
    assert.ok(divisionSeven.wordCount > 0);
  }
});

test("rebuttal matrix with four entries triggers warning", () => {
  const rebuttals = Array.from({ length: 4 }, (_, index) =>
    `When opposition argues claim ${index + 1}, respond with Article 21 proportionality [Source 1](https://indiankanoon.org/doc/1766147/).`
  ).join("\n");
  const pois = Array.from({ length: 15 }, () =>
    "Would the delegate explain why this position ignores Supreme Court safeguards?"
  ).join("\n");
  const report = runQualityGate(`DIVISION 7 - DEBATE UTILITY ARSENAL\n${rebuttals}\n${pois}`, engine, registryWithCourt());
  const divisionSeven = report.divisionReports.find((division) => division.divisionId === "debate_utility");

  assert.ok(divisionSeven?.issues.some((issue) => issue.includes("minimum 5")));
});

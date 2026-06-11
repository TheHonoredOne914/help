import { test } from "node:test";
import assert from "node:assert";
import { runDimensionEngine } from "../src/lib/dimension-engine.js";
import { buildEvidenceRegistry } from "../src/lib/evidence-registry.js";
import { runDivisionPipeline } from "../src/services/division-engine.js";
import { runQualityGate } from "../src/lib/quality-gate.js";
import type { EnrichedResult } from "../src/lib/types.js";

// Mock model pool for testing
function mockModelPool() {
  const mockClient = {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: "Mock division content with sufficient detail. " + "word ".repeat(500) } }]
        })
      }
    }
  };
  return [
    { client: mockClient, modelId: "mock-best-model" },
    { client: mockClient, modelId: "mock-worker-model" }
  ];
}

// Helper to create mock enriched results
function mockEnrichedResult(overrides: Partial<EnrichedResult> = {}): EnrichedResult {
  return {
    title: "Mock Source",
    url: "https://example.com/mock",
    snippet: "Mock snippet content",
    content: "Mock full content with detailed information. ".repeat(50),
    engine: "tavily" as const,
    score: 9,
    sourceType: "government_india" as const,
    relevanceScore: 0.8,
    combinedScore: 9.8,
    ...overrides
  };
}

test("Test 1: Article 356 and Governor role activates federalism, political, constitutional dimensions", async () => {
  const agendaText = "Discuss the validity of Article 356 and Governor's role in state dismissal";
  const committeeType = "aippm";
  
  const engine = runDimensionEngine(agendaText, committeeType);
  
  // Check primary dimensions include federalism, political, constitutional
  const primaryNames = engine.primaryDimensions.map(d => d.name);
  assert.ok(primaryNames.includes("federalism"), "Should activate federalism dimension");
  assert.ok(primaryNames.includes("political") || primaryNames.includes("constitutional"), 
    "Should activate political or constitutional dimension");
  
  // Check committee type
  assert.strictEqual(engine.committeeType, "aippm");
  
  // Check debate register is combative for AIPPM
  assert.strictEqual(engine.structuralDNA.debateRegister, "combative");
  
  console.log("✓ Test 1: Dimensions activated:", primaryNames.join(", "));
  console.log("✓ Test 1: Debate register:", engine.structuralDNA.debateRegister);
});

test("Test 2: Section 124A sedition activates constitutional, political, human_rights dimensions", async () => {
  const agendaText = "Should India decriminalize Section 124A IPC sedition law?";
  const committeeType = "constitutional";
  
  const engine = runDimensionEngine(agendaText, committeeType);
  
  const primaryNames = engine.primaryDimensions.map(d => d.name);
  const allNames = [...engine.primaryDimensions, ...engine.secondaryDimensions].map(d => d.name);
  
  assert.ok(primaryNames.includes("constitutional"), "Should activate constitutional dimension");
  assert.ok(allNames.includes("political") || allNames.includes("human_rights") || allNames.includes("judiciary"), 
    "Should activate political, human_rights, or judiciary dimension");
  
  // Check agenda class
  assert.ok(["rights_constitutional", "governance_policy"].includes(engine.agendaClass),
    "Should classify as rights_constitutional or governance_policy");
  
  console.log("✓ Test 2: Dimensions activated:", primaryNames.join(", "));
  console.log("✓ Test 2: All dimensions:", allNames.join(", "));
  console.log("✓ Test 2: Agenda class:", engine.agendaClass);
});

test("Test 3: Press freedom ranking activates media_information and human_rights dimensions", async () => {
  const agendaText = "India's press freedom ranking and journalist safety";
  const committeeType = "human_rights";
  
  const engine = runDimensionEngine(agendaText, committeeType);
  
  const primaryNames = engine.primaryDimensions.map(d => d.name);
  const allNames = [...engine.primaryDimensions, ...engine.secondaryDimensions].map(d => d.name);
  
  assert.ok(allNames.includes("media_information"), "Should activate media_information dimension");
  assert.ok(allNames.includes("human_rights"), "Should activate human_rights dimension");
  
  console.log("✓ Test 3: Primary dimensions:", primaryNames.join(", "));
  console.log("✓ Test 3: All active dimensions:", allNames.join(", "));
});

test("Test 4: Communal riots crisis activates social_stability, security, crisis classification", async () => {
  const agendaText = "Crisis: Communal riots in UP — immediate committee response";
  const committeeType = "crisis";
  
  const engine = runDimensionEngine(agendaText, committeeType);
  
  const primaryNames = engine.primaryDimensions.map(d => d.name);
  assert.ok(primaryNames.includes("social_stability") || primaryNames.includes("security"), 
    "Should activate social_stability or security dimension");
  
  // Check committee type
  assert.strictEqual(engine.committeeType, "crisis");
  
  // Check agenda class
  assert.strictEqual(engine.agendaClass, "crisis", "Should classify as crisis");
  
  // Check debate register is combative for crisis
  assert.strictEqual(engine.structuralDNA.debateRegister, "combative");
  
  // Check lead division is predictive_analysis for crisis
  assert.strictEqual(engine.structuralDNA.leadDivision, "predictive_analysis");
  
  console.log("✓ Test 4: Dimensions activated:", primaryNames.join(", "));
  console.log("✓ Test 4: Lead division:", engine.structuralDNA.leadDivision);
  console.log("✓ Test 4: Debate register:", engine.structuralDNA.debateRegister);
});

test("Test 5: Division pipeline with mock evidence produces quality output", async () => {
  const agendaText = "Discuss Article 21 privacy rights and Supreme Court interpretation";
  const engine = runDimensionEngine(agendaText, "constitutional");
  
  // Create mock evidence registry with court judgement
  const mockResults: EnrichedResult[] = [
    mockEnrichedResult({
      title: "Puttaswamy v. Union of India",
      url: "https://indiankanoon.org/doc/mock",
      sourceType: "court_judgement",
      judgement: {
        isJudgement: true,
        caseName: "Justice K.S. Puttaswamy v. Union of India",
        caseNumber: "Writ Petition (Civil) No. 494 of 2012",
        year: "2017",
        court: "Supreme Court of India",
        bench: "9-judge bench",
        held: "Right to privacy is a fundamental right under Article 21",
        relevance: "Establishes privacy as fundamental right",
        url: "https://indiankanoon.org/doc/mock"
      }
    }),
    mockEnrichedResult({
      title: "CAG Report on Aadhaar",
      url: "https://cag.gov.in/mock",
      sourceType: "government_india",
      reportType: "CAG Annual Report 2023"
    })
  ];
  
  const registry = buildEvidenceRegistry(mockResults, agendaText);
  
  // Check evidence registry
  assert.ok(registry.courtJudgements.length > 0, "Should have court judgements");
  assert.ok(registry.tier1Sources.length > 0, "Should have tier1 sources");
  
  // Run division pipeline
  const modelPool = mockModelPool();
  const { divisions, assembledBriefing } = await runDivisionPipeline(engine, registry, modelPool);
  
  // Check all divisions generated
  assert.strictEqual(divisions.size, 11, "Should generate all 11 divisions");
  
  // Check quality gate
  const qualityReport = runQualityGate(assembledBriefing, engine, registry);
  
  console.log("✓ Test 5: Divisions generated:", divisions.size);
  console.log("✓ Test 5: Quality score:", qualityReport.overallScore);
  console.log("✓ Test 5: Critical failures:", qualityReport.criticalFailures.length);
  
  // Quality should pass or trigger repair
  assert.ok(qualityReport.overallScore > 0, "Should have non-zero quality score");
});

test("Test 6: Evidence registry correctly classifies sources by tier", async () => {
  const mockResults: EnrichedResult[] = [
    mockEnrichedResult({
      title: "Supreme Court Judgement",
      url: "https://indiankanoon.org/doc/123",
      sourceType: "court_judgement"
    }),
    mockEnrichedResult({
      title: "CAG Audit Report",
      url: "https://cag.gov.in/report",
      sourceType: "government_india"
    }),
    mockEnrichedResult({
      title: "PRS Legislative Brief",
      url: "https://prsindia.org/brief",
      sourceType: "legal_india"
    }),
    mockEnrichedResult({
      title: "Freedom House Report",
      url: "https://freedomhouse.org/india",
      sourceType: "international_research",
      score: 9
    })
  ];
  
  const registry = buildEvidenceRegistry(mockResults, "Test agenda");
  
  // Check tier classification
  assert.ok(registry.tier1Sources.length > 0, "Should have tier1 sources (court judgements)");
  assert.ok(registry.tier2Sources.length > 0, "Should have tier2 sources (CAG, PRS)");
  
  console.log("✓ Test 6: Tier1 sources:", registry.tier1Sources.length);
  console.log("✓ Test 6: Tier2 sources:", registry.tier2Sources.length);
  console.log("✓ Test 6: Total sources:", registry.sources.length);
});

test("Test 7: Synonym expansion increases dimension detection", async () => {
  // Test with synonym-heavy text
  const agendaText = "Discuss writ petitions and judicial review of ultra vires legislation";
  const engine = runDimensionEngine(agendaText, "constitutional");
  
  const primaryNames = engine.primaryDimensions.map(d => d.name);
  
  // Should activate constitutional dimension via synonyms
  assert.ok(primaryNames.includes("constitutional"), "Should detect constitutional via synonyms");
  
  // Check that triggers include synonym matches
  const constitutionalDim = engine.primaryDimensions.find(d => d.name === "constitutional");
  assert.ok(constitutionalDim, "Should have constitutional dimension");
  assert.ok(constitutionalDim.triggerKeywords.length > 0, "Should have trigger keywords");
  
  console.log("✓ Test 7: Constitutional dimension score:", constitutionalDim.boostedScore);
  console.log("✓ Test 7: Trigger keywords:", constitutionalDim.triggerKeywords.slice(0, 5).join(", "));
});

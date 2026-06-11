/**
 * Integration Test - Real API Call
 * 
 * This test makes actual API calls to test the full pipeline.
 * Requires API keys in .env file:
 * - GROQ_API_KEY
 * - TAVILY_API_KEY (or SERPER_KEY or BRAVE_KEY)
 * - GEMINI_API_KEY (optional)
 * 
 * Run with: node --import tsx tests/integration-test.ts
 */

import { runDimensionEngine } from "../src/lib/dimension-engine.js";
import { buildEvidenceRegistry } from "../src/lib/evidence-registry.js";
import { runDivisionPipeline } from "../src/services/division-engine.js";
import { runQualityGate } from "../src/lib/quality-gate.js";
import { searchWebDeep } from "../src/lib/web-search.js";
import { enrichResults } from "../src/lib/rag.js";
import { getGroqClient } from "../src/lib/groq-client.js";
import { getGeminiClient } from "../src/lib/gemini-client.js";
import type { EnrichedResult } from "../src/lib/types.js";

// Load environment variables
const GROQ_KEY = process.env.GROQ_API_KEY;
const TAVILY_KEY = process.env.TAVILY_API_KEY;
const SERPER_KEY = process.env.SERPER_KEY;
const BRAVE_KEY = process.env.BRAVE_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const JINA_KEY = process.env.JINA_KEY;

async function runIntegrationTest() {
  console.log("\n=== BestDel Integration Test ===\n");
  
  // Check API keys
  if (!GROQ_KEY) {
    console.error("❌ GROQ_API_KEY not found in environment");
    console.log("Please add your API keys to .env file");
    process.exit(1);
  }
  
  if (!TAVILY_KEY && !SERPER_KEY && !BRAVE_KEY) {
    console.error("❌ No search API key found (need TAVILY_API_KEY, SERPER_KEY, or BRAVE_KEY)");
    process.exit(1);
  }
  
  console.log("✓ API keys found");
  console.log(`  - Groq: ${GROQ_KEY.slice(0, 10)}...`);
  console.log(`  - Search: ${TAVILY_KEY ? 'Tavily' : SERPER_KEY ? 'Serper' : 'Brave'}`);
  console.log(`  - Gemini: ${GEMINI_KEY ? 'Yes' : 'No (optional)'}`);
  
  // Test scenario
  const agendaText = "Discuss the validity of Article 356 and Governor's role in state dismissal";
  const committeeType = "aippm";
  
  console.log(`\n📋 Test Agenda: "${agendaText}"`);
  console.log(`🏛️  Committee: ${committeeType.toUpperCase()}\n`);
  
  // Phase 1: Dimension Engine
  console.log("Phase 1: Running Dimension Engine...");
  const startDimension = Date.now();
  const engine = runDimensionEngine(agendaText, committeeType);
  const dimensionTime = Date.now() - startDimension;
  
  console.log(`✓ Dimension Engine complete (${dimensionTime}ms)`);
  console.log(`  Primary Dimensions: ${engine.primaryDimensions.map(d => d.name).join(", ")}`);
  console.log(`  Agenda Class: ${engine.agendaClass}`);
  console.log(`  Debate Register: ${engine.structuralDNA.debateRegister}`);
  console.log(`  Lead Division: ${engine.structuralDNA.leadDivision}`);
  
  // Phase 2: Web Search & Evidence Gathering
  console.log("\nPhase 2: Gathering Evidence...");
  const startSearch = Date.now();
  
  const searchKeys = {
    tavilyKey: TAVILY_KEY,
    serperKey: SERPER_KEY,
    braveKey: BRAVE_KEY,
  };
  
  // Perform deep search
  const searchResults = await searchWebDeep(agendaText, searchKeys, "governance_policy");
  console.log(`✓ Search complete: ${searchResults.length} results`);
  
  // Enrich results
  const enriched = await enrichResults(
    searchResults,
    agendaText,
    Math.min(15, searchResults.length),
    (i, total) => {
      if (i % 5 === 0) process.stdout.write(`  Fetching content: ${i}/${total}\r`);
    },
    JINA_KEY,
    "deep"
  ) as EnrichedResult[];
  
  const searchTime = Date.now() - startSearch;
  console.log(`\n✓ Content enrichment complete (${searchTime}ms)`);
  console.log(`  Enriched: ${enriched.length} sources`);
  console.log(`  With content: ${enriched.filter(r => (r.content?.length ?? 0) > 500).length}`);
  
  // Build evidence registry
  const registry = buildEvidenceRegistry(enriched, agendaText);
  console.log(`\n✓ Evidence Registry built:`);
  console.log(`  Total sources: ${registry.sources.length}`);
  console.log(`  Tier 1: ${registry.tier1Sources.length}`);
  console.log(`  Tier 2: ${registry.tier2Sources.length}`);
  console.log(`  Court judgements: ${registry.courtJudgements.length}`);
  console.log(`  Snippet-only: ${registry.snippetOnlySources.length}`);
  console.log(`  Evidence gaps: ${registry.evidenceGaps.length}`);
  
  // Phase 3: Division Pipeline
  console.log("\nPhase 3: Generating Divisions...");
  const startDivisions = Date.now();
  
  const groqClient = getGroqClient(GROQ_KEY);
  const modelPool = [
    { client: groqClient, modelId: "llama-3.3-70b-versatile" },
    { client: groqClient, modelId: "llama-3.1-8b-instant" },
  ];
  
  if (GEMINI_KEY) {
    const geminiClient = getGeminiClient(GEMINI_KEY);
    modelPool.unshift({ client: geminiClient, modelId: "gemini-2.0-flash-exp" });
  }
  
  console.log(`  Model pool: ${modelPool.length} models`);
  
  let divisionProgress = 0;
  const { divisions, assembledBriefing } = await runDivisionPipeline(
    engine,
    registry,
    modelPool,
    {
      onProgress: (current, total) => {
        if (current > divisionProgress) {
          divisionProgress = current;
          console.log(`  Division ${current}/${total} complete`);
        }
      }
    }
  );
  
  const divisionsTime = Date.now() - startDivisions;
  console.log(`\n✓ All divisions generated (${divisionsTime}ms)`);
  
  // Phase 4: Quality Gate
  console.log("\nPhase 4: Quality Gate Analysis...");
  const qualityReport = runQualityGate(assembledBriefing, engine, registry);
  
  console.log(`✓ Quality Score: ${qualityReport.overallScore}/100`);
  console.log(`  Passed: ${qualityReport.passed ? 'YES' : 'NO'}`);
  console.log(`  Critical Failures: ${qualityReport.criticalFailures.length}`);
  console.log(`  Warnings: ${qualityReport.warnings.length}`);
  
  if (qualityReport.criticalFailures.length > 0) {
    console.log("\n⚠️  Critical Failures:");
    qualityReport.criticalFailures.forEach(f => console.log(`    - ${f}`));
  }
  
  // Division-by-division analysis
  console.log("\n📊 Division Quality Report:");
  for (const divReport of qualityReport.divisionReports) {
    const status = divReport.issues.length === 0 ? "✓" : "⚠️";
    console.log(`  ${status} ${divReport.divisionName}`);
    console.log(`     Words: ${divReport.wordCount}, Citations: ${divReport.citationCount}, Specificity: ${divReport.specificityScore.toFixed(1)}`);
    if (divReport.issues.length > 0) {
      divReport.issues.forEach(issue => console.log(`     ⚠️  ${issue}`));
    }
  }
  
  // Output statistics
  const totalWords = assembledBriefing.split(/\s+/).filter(Boolean).length;
  const totalChars = assembledBriefing.length;
  const totalCitations = assembledBriefing.match(/\[Source \d+\]\([^)]+\)/g)?.length ?? 0;
  
  console.log("\n📈 Output Statistics:");
  console.log(`  Total words: ${totalWords.toLocaleString()}`);
  console.log(`  Total characters: ${totalChars.toLocaleString()}`);
  console.log(`  Total citations: ${totalCitations}`);
  console.log(`  Average words per division: ${Math.round(totalWords / divisions.size)}`);
  console.log(`  Citation density: ${(totalCitations / (totalWords / 100)).toFixed(2)} per 100 words`);
  
  // Timing summary
  const totalTime = dimensionTime + searchTime + divisionsTime;
  console.log("\n⏱️  Timing Summary:");
  console.log(`  Dimension Engine: ${dimensionTime}ms`);
  console.log(`  Evidence Gathering: ${searchTime}ms (${(searchTime/1000).toFixed(1)}s)`);
  console.log(`  Division Generation: ${divisionsTime}ms (${(divisionsTime/1000).toFixed(1)}s)`);
  console.log(`  Total: ${totalTime}ms (${(totalTime/1000).toFixed(1)}s)`);
  
  // Save output
  const fs = await import("fs/promises");
  const outputPath = "integration-test-output.md";
  await fs.writeFile(outputPath, assembledBriefing);
  console.log(`\n💾 Full output saved to: ${outputPath}`);
  
  // Show sample from each division
  console.log("\n📄 Sample Output (first 200 chars of each division):\n");
  for (const [divId, content] of divisions) {
    const divName = divId.replace(/_/g, " ").toUpperCase();
    console.log(`--- ${divName} ---`);
    console.log(content.slice(0, 200).trim() + "...\n");
  }
  
  // Final verdict
  console.log("\n" + "=".repeat(60));
  if (qualityReport.passed && qualityReport.overallScore >= 70) {
    console.log("✅ INTEGRATION TEST PASSED");
    console.log(`   Quality: ${qualityReport.overallScore}/100`);
    console.log(`   Output: ${totalWords} words with ${totalCitations} citations`);
  } else {
    console.log("⚠️  INTEGRATION TEST COMPLETED WITH WARNINGS");
    console.log(`   Quality: ${qualityReport.overallScore}/100`);
    console.log(`   Issues: ${qualityReport.criticalFailures.length} critical, ${qualityReport.warnings.length} warnings`);
  }
  console.log("=".repeat(60) + "\n");
}

// Run the test
runIntegrationTest().catch(err => {
  console.error("\n❌ Integration test failed:");
  console.error(err);
  process.exit(1);
});

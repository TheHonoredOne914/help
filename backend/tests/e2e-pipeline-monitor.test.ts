import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";

import app from "../src/app.ts";

const TEST_QUERIES = [
  {
    label: "AIPPM - Article 356 President's Rule",
    query: "Discuss the constitutional validity of Article 356 and the Governor's role in state dismissal",
    committee: "aippm",
    mode: "deep_research",
    minWords: 2500,
    minCitations: 15,
    minSources: 10,
    expectedDivisions: 11,
  },
  {
    label: "Lok Sabha - CAG audit findings on MGNREGA",
    query: "Examine CAG audit findings on MGNREGA fund diversion and accountability failures",
    committee: "lok_sabha",
    mode: "deep_research",
    minWords: 2500,
    minCitations: 15,
    minSources: 8,
    expectedDivisions: 11,
  },
  {
    label: "Human Rights - UAPA political detentions",
    query: "Evaluate UAPA misuse in political detention of activists and journalists in India 2020-2025",
    committee: "human_rights",
    mode: "deep_research",
    minWords: 2500,
    minCitations: 12,
    minSources: 10,
    expectedDivisions: 11,
  },
  {
    label: "Web Search mode - sedition law repeal",
    query: "India sedition law Section 124A repeal Supreme Court 2025",
    committee: "constitutional",
    mode: "web_search",
    minWords: 800,
    minCitations: 6,
    minSources: 5,
    expectedDivisions: 0,
  },
] as const;

interface PipelineTrace {
  queriesFired: string[];
  sourcesFound: Array<{ url: string; engine: string; score?: number; sourceType?: string }>;
  batchesRun: string[];
  divisionsCompleted: string[];
  synthesisStarted: boolean;
  finalResponse: string;
  citationsInResponse: number;
  wordCount: number;
  qualityGateScore: number;
  verificationPassed: boolean;
  evidenceRegistryReceived: boolean;
  dimensionScoresReceived: boolean;
  errors: string[];
  rawEvents: object[];
}

async function runQueryAndCollectTrace(
  baseUrl: string,
  testCase: (typeof TEST_QUERIES)[number],
  apiKeys: Record<string, string>,
): Promise<PipelineTrace> {
  const trace: PipelineTrace = {
    queriesFired: [],
    sourcesFound: [],
    batchesRun: [],
    divisionsCompleted: [],
    synthesisStarted: false,
    finalResponse: "",
    citationsInResponse: 0,
    wordCount: 0,
    qualityGateScore: 0,
    verificationPassed: false,
    evidenceRegistryReceived: false,
    dimensionScoresReceived: false,
    errors: [],
    rawEvents: [],
  };

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(finalizeTrace(trace)), 5 * 60 * 1000);
    const body = JSON.stringify({
      mode: testCase.mode,
      message: testCase.query,
      systemPrompt: `Committee: ${testCase.committee}`,
      models: [apiKeys.primaryModel || "groq::llama-3.3-70b-versatile"],
      tavilyKey: apiKeys.tavilyKey,
      braveKey: apiKeys.braveKey,
      serperKey: apiKeys.serperKey,
      jinaKey: apiKeys.jinaKey,
      groqKey: apiKeys.groqKey,
      geminiKey: apiKeys.geminiKey,
    });

    fetch(`${baseUrl}/api/messages/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body,
    }).then(async (resp) => {
      if (!resp.ok) {
        trace.errors.push(`HTTP ${resp.status}`);
        clearTimeout(timeout);
        resolve(finalizeTrace(trace));
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) {
        trace.errors.push("Missing response body");
        clearTimeout(timeout);
        resolve(finalizeTrace(trace));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            collectEvent(trace, event);
            if (event.done) {
              clearTimeout(timeout);
              resolve(finalizeTrace(trace));
              return;
            }
          } catch {
            // Ignore malformed SSE lines.
          }
        }
      }
      clearTimeout(timeout);
      resolve(finalizeTrace(trace));
    }).catch((err) => {
      trace.errors.push(String(err));
      clearTimeout(timeout);
      resolve(finalizeTrace(trace));
    });
  });
}

function collectEvent(trace: PipelineTrace, event: any): void {
  trace.rawEvents.push(event);
  if (typeof event.searching === "string") trace.queriesFired.push(event.searching);
  if (Array.isArray(event.found)) {
    trace.sourcesFound.push(...event.found.map((f: any) => ({
      url: f.url,
      engine: f.engine ?? "unknown",
      score: f.score,
      sourceType: f.sourceType,
    })));
  }
  if (typeof event.batchStart === "string") trace.batchesRun.push(event.batchStart);
  if (typeof event.divisionComplete === "string") trace.divisionsCompleted.push(event.divisionComplete);
  if (event.type === "evidence_registry") trace.evidenceRegistryReceived = true;
  if (event.type === "dimension_scores") trace.dimensionScoresReceived = true;
  if (event.synthesizing) trace.synthesisStarted = true;
  if (typeof event.content === "string") trace.finalResponse += event.content;
  if (event.qualityGate?.overallScore != null) trace.qualityGateScore = event.qualityGate.overallScore;
  if (event.verificationPassed != null) trace.verificationPassed = event.verificationPassed;
}

function finalizeTrace(trace: PipelineTrace): PipelineTrace {
  const words = trace.finalResponse.trim().split(/\s+/).filter(Boolean);
  trace.wordCount = words.length;
  const citationMatches = trace.finalResponse.matchAll(/\[Source\s*\d+\]\([^)]+\)/gi);
  trace.citationsInResponse = new Set([...citationMatches].map((match) => match[0])).size;
  return trace;
}

const hasLiveKeys = Boolean(process.env.GROQ_API_KEY && (process.env.TAVILY_API_KEY || process.env.BRAVE_API_KEY || process.env.SERPER_KEY));

describe("BestDel E2E Pipeline Validation", { skip: hasLiveKeys ? false : "Set GROQ_API_KEY and at least one search key to run live pipeline monitor" }, () => {
  let baseUrl: string;
  let server: Server;
  const apiKeys = {
    groqKey: process.env.GROQ_API_KEY ?? "",
    tavilyKey: process.env.TAVILY_API_KEY ?? "",
    braveKey: process.env.BRAVE_API_KEY ?? "",
    serperKey: process.env.SERPER_KEY ?? "",
    geminiKey: process.env.GEMINI_API_KEY ?? "",
    jinaKey: process.env.JINA_KEY ?? "",
    primaryModel: process.env.TEST_PRIMARY_MODEL ?? "groq::llama-3.3-70b-versatile",
  };

  before(async () => {
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as { port: number };
    baseUrl = `http://localhost:${addr.port}`;
  });

  after(() => server?.close());

  for (const tc of TEST_QUERIES) {
    test(tc.label, async () => {
      const trace = await runQueryAndCollectTrace(baseUrl, tc, apiKeys);

      assert.ok(trace.queriesFired.length >= 3, `Expected >=3 web queries, got ${trace.queriesFired.length}`);
      assert.ok(trace.sourcesFound.length >= tc.minSources, `Expected >=${tc.minSources} sources, got ${trace.sourcesFound.length}`);
      assert.equal(trace.sourcesFound.filter((s) => /reddit\.com|quora\.com|medium\.com|substack\.com|twitter\.com|x\.com/i.test(s.url)).length, 0);
      assert.ok(trace.sourcesFound.filter((s) =>
        s.sourceType === "government_india" ||
        s.sourceType === "government_international" ||
        s.sourceType === "court_judgement" ||
        s.sourceType === "academic_india"
      ).length >= 2);
      assert.ok(trace.wordCount >= tc.minWords, `Expected >=${tc.minWords} words, got ${trace.wordCount}`);
      assert.ok(trace.citationsInResponse >= tc.minCitations, `Expected >=${tc.minCitations} citations, got ${trace.citationsInResponse}`);

      if (tc.mode === "deep_research") {
        assert.ok(trace.divisionsCompleted.length >= tc.expectedDivisions);
        assert.ok(trace.evidenceRegistryReceived);
        assert.ok(trace.dimensionScoresReceived);
      }

      assert.deepEqual(trace.errors, []);
      const bulletLines = trace.finalResponse.split("\n").filter((line) => /^[-*]\s|^•\s/.test(line.trimStart()));
      const totalLines = trace.finalResponse.split("\n").filter((line) => line.trim().length > 0).length;
      assert.ok(totalLines === 0 || bulletLines.length / totalLines < 0.5);
    });
  }
});

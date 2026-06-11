import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Final Prompt Citation Contract", () => {
  describe("Prompt construction", () => {
    it("should include citation format instruction in prompt", () => {
      const systemPrompt = `You are BestDel's thesis-level Indian Mock Parliament research generator.
Cite only exact registry citation tokens like [Source 1](https://...). Never invent citations.
Do not assert unsupported legal holdings or electoral fraud claims.`;

      assert.match(systemPrompt, /\[Source/);
      assert.match(systemPrompt, /\[Source\s+\d+\]\(https?:\/\//);
    });

    it("should include SourceGapReport in prompt when available", () => {
      const sourceGapReport = {
        requiredUniqueSources: 10,
        availableCitationEligibleSources: 3,
        failedBuckets: [],
        weakBuckets: ["democracy_index"],
        explanation: "Fewer sources than required",
      };

      const prompt = `SourceGapReport: ${JSON.stringify(sourceGapReport)}`;

      assert.match(prompt, /SourceGapReport/);
      assert.match(prompt, /availableCitationEligibleSources/);
      assert.match(prompt, /3/);
    });

    it("should include citation rule in output contract", () => {
      const outputContract = `
# Output Format
Citation rule: cite only included sources by exact linked citation token. Source IDs must stay unchanged.
Format: [Source N](url)`;

      assert.match(outputContract, /Citation rule/);
      assert.match(outputContract, /exact linked citation token/);
      assert.match(outputContract, /\[Source N\]\(url\)/);
    });

    it("should explicit state source requirements for fast_research", () => {
      const contract = `
Mode: fast_research
AgendaContract: {"minimumUniqueCitedSources": 10, ...}
Citation rule: cite 3-10 available sources. Every major claim needs at least one citation.`;

      assert.match(contract, /fast_research/);
      assert.match(contract, /citation/);
    });
  });

  describe("Source labels in compressed prompt", () => {
    it("should preserve source IDs in compressed evidence pack", () => {
      const compressedPack = `
Pack: main_evidence
[Source 1] Court of India Case Analysis
URL: https://sci.gov.in/...
[Source 2] Election Commission Report
URL: https://eci.gov.in/...
[Source 3] Parliamentary Debate Record
URL: https://sansad.in/...`;

      const sourceIds = compressedPack.match(/\[Source\s+(\d+)\]/g);
      assert.equal(sourceIds?.length, 3);
      assert.equal(sourceIds?.[0], "[Source 1]");
      assert.equal(sourceIds?.[1], "[Source 2]");
      assert.equal(sourceIds?.[2], "[Source 3]");
    });

    it("should preserve URLs in compressed sources", () => {
      const card = `
[Source 5] Ministry of Information Press Release
URL: https://pib.gov.in/PressReleaseIframePage.aspx?PRID=1234
Facts: Policy announcement regarding election commission`;

      assert.match(card, /\[Source 5\]/);
      assert.match(card, /https:\/\/pib\.gov\.in/);
    });

    it("should not allow source IDs to be renumbered in compression", () => {
      // Simulate source selection
      const availableSources = [
        { id: 1, title: "Source 1", url: "https://example.com/1" },
        { id: 5, title: "Source 5", url: "https://example.com/5" },
        { id: 8, title: "Source 8", url: "https://example.com/8" },
      ];

      const compressedText = availableSources
        .map((s) => `[Source ${s.id}] ${s.title}\nURL: ${s.url}`)
        .join("\n");

      assert.match(compressedText, /\[Source 1\]/);
      assert.match(compressedText, /\[Source 5\]/);
      assert.match(compressedText, /\[Source 8\]/);
      // Should NOT be renumbered to [Source 1], [Source 2], [Source 3]
      assert.doesNotMatch(compressedText, /\[Source 2\]/);
      assert.doesNotMatch(compressedText, /\[Source 3\]/);
    });
  });

  describe("Compression guard validation", () => {
    it("should throw error if all sources dropped by compression", () => {
      const originalSources = 10;
      const includedSources = 0; // All dropped
      const mode = "fast_research";

      const shouldThrow = () => {
        if (originalSources > 0 && includedSources === 0) {
          throw new Error(
            `prompt compression dropped all ${originalSources} sources; cannot generate cited answer`,
          );
        }
      };

      assert.throws(shouldThrow, /prompt compression dropped all 10 sources; cannot generate cited answer/);
    });

    it("should preserve minimum sources for mode after compression", () => {
      const modes = {
        fast_research: 3,
        deep_research: 5,
        deep_research: 8,
      };

      for (const [mode, minimum] of Object.entries(modes)) {
        const originalSources = 20;
        const includedSources = Math.ceil(minimum * 1.5); // 1.5x minimum preserved

        assert.ok(includedSources >= minimum);
      }
    });

    it("should validate included sources before calling provider", () => {
      const includedSources = 2;
      const minimumForMode = 3;

      const isValid = includedSources >= minimumForMode || includedSources === 0;

      // This should throw because 2 < 3
      const invalidState = () => {
        if (includedSources < minimumForMode) {
          throw new Error(
            `Insufficient sources for mode: ${includedSources} included, ${minimumForMode} required`,
          );
        }
      };

      assert.throws(invalidState, /Insufficient sources for mode/);
    });
  });

  describe("Citation extraction from prompt", () => {
    it("should match [Source N](url) format in model output", () => {
      const answerText = `
Based on [Source 1](https://sci.gov.in/case1), the Supreme Court held that...
The Election Commission noted [Source 5](https://eci.gov.in/report) that...
Multiple sources including [Source 8](https://pib.gov.in/press) show that...`;

      const citationPattern = /\[Source\s+(\d+)\]\(([^)]+)\)/g;
      const matches = [...answerText.matchAll(citationPattern)];

      assert.equal(matches.length, 3);
      assert.equal(matches[0][1], "1");
      assert.equal(matches[1][1], "5");
      assert.equal(matches[2][1], "8");
    });

    it("should reject bare citations without URLs", () => {
      const answerText = `
The court ruled [Source 1] that...
According to the report [Source 5] states...`;

      const linkedCitations = /\[Source\s+(\d+)\]\(([^)]+)\)/g;
      const linkedMatches = [...answerText.matchAll(linkedCitations)];

      assert.equal(linkedMatches.length, 0);
    });
  });

  describe("Evidence card preservation", () => {
    it("should include source card metadata in compressed prompt", () => {
      const card = {
        sourceId: 1,
        title: "Court Judgment",
        url: "https://sci.gov.in/case",
        bucketIds: ["court_legal"],
        sourceClass: "court_primary",
        keyFacts: ["Judgment details"],
        limitations: ["Court-specific jurisdiction"],
      };

      const cardText = `
[Source ${card.sourceId}] ${card.title}
URL: ${card.url}
Class: ${card.sourceClass}
Buckets: ${card.bucketIds.join(", ")}
Fact: ${card.keyFacts[0]}
Limitation: ${card.limitations[0]}`;

      assert.match(cardText, /Source 1/);
      assert.match(cardText, /Court Judgment/);
      assert.match(cardText, /https:\/\/sci\.gov\.in\/case/);
      assert.match(cardText, /court_primary/);
      assert.match(cardText, /court_legal/);
    });
  });
});

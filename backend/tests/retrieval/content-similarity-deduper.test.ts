import test from "node:test";
import assert from "node:assert/strict";
import { dedupeByContentSimilarity } from "../../src/core/retrieval/source-deduper.js";

test("content similarity dedupe removes near duplicates and keeps higher authority", () => {
  const kept = dedupeByContentSimilarity([
    { url: "https://low.example/a", title: "Supreme Court VVPAT judgment India election", snippet: "The Supreme Court VVPAT judgment India election process and voter verification safeguards.", score: 40 },
    { url: "https://high.example/b", title: "Supreme Court VVPAT judgment India election", snippet: "The Supreme Court VVPAT judgment India election process and voter verification safeguards.", score: 95 },
    { url: "https://other.example/c", title: "RSF press freedom India rank", snippet: "World Press Freedom Index India rank and media environment.", score: 80 },
  ]);

  assert.equal(kept.length, 2);
  assert.equal(kept[0].url, "https://high.example/b");
  assert.deepEqual(kept[0].duplicateOf, ["https://low.example/a"]);
});

test("same normalized title across different hosts is kept unless snippets are near-identical", () => {
  const kept = dedupeByContentSimilarity([
    {
      url: "https://thehindu.com/eci-deepfakes",
      title: "ECI issues guidelines on deepfakes Latest",
      snippet: "The Election Commission outlined takedown timelines for synthetic political ads.",
      score: 70,
    },
    {
      url: "https://indianexpress.com/eci-deepfakes",
      title: "ECI issues guidelines on deepfakes Explained",
      snippet: "Platforms must label AI-generated campaign content under the new advisory.",
      score: 72,
    },
    {
      url: "https://thehindu.com/eci-deepfakes-mirror",
      title: "ECI issues guidelines on deepfakes Analysis",
      snippet: "A second Hindu page restating the same advisory framing for readers.",
      score: 60,
    },
  ]);

  assert.equal(kept.length, 2);
  assert.ok(kept.some((source) => source.url.includes("thehindu.com")));
  assert.ok(kept.some((source) => source.url.includes("indianexpress.com")));
  assert.equal(kept.filter((source) => source.url.includes("thehindu.com")).length, 1);
});

test("cross-host mid-similarity wire echoes are kept; only near-verbatim copies collapse", () => {
  const sharedLead =
    "The Election Commission of India directed platforms to remove unlawful AI-generated election content within three hours of a report under the IT Act and Model Code of Conduct.";
  const kept = dedupeByContentSimilarity([
    {
      url: "https://publisher-a.example/eci-ai",
      title: "ECI tightens AI content rules",
      snippet: `${sharedLead} Parties must label synthetic campaign material clearly for voters.`,
      score: 70,
    },
    {
      url: "https://publisher-b.example/eci-ai",
      title: "Poll panel flags deepfakes",
      snippet: `${sharedLead} State IT nodal officers have already taken down thousands of posts since the schedule announcement.`,
      score: 72,
    },
    {
      url: "https://publisher-c.example/eci-ai-copy",
      title: "ECI tightens AI content rules",
      snippet: `${sharedLead} Parties must label synthetic campaign material clearly for voters.`,
      score: 60,
    },
  ]);

  assert.equal(kept.length, 2);
  assert.ok(kept.some((source) => source.url.includes("publisher-a.example")));
  assert.ok(kept.some((source) => source.url.includes("publisher-b.example")));
  assert.deepEqual(
    kept.find((source) => source.url.includes("publisher-a.example"))?.duplicateOf,
    ["https://publisher-c.example/eci-ai-copy"],
  );
});

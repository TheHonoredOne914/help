import test from "node:test";
import assert from "node:assert/strict";
import { selectBackupSource } from "../../../src/core/retrieval/enrichment/backup-source-selector.js";

test("selectBackupSource chooses the best unprocessed source with bucket overlap", () => {
  const backup = selectBackupSource([
    { title: "Failed", url: "https://failed.example.com", snippet: "x", bucketIds: ["court_legal"], score: 99 },
    { title: "Low", url: "https://blog.example.com", snippet: "x", bucketIds: ["court_legal"], score: 20 },
    { title: "Court", url: "https://main.sci.gov.in/judgment", snippet: "Supreme Court", bucketIds: ["court_legal"], score: 80 },
    { title: "Other", url: "https://pib.gov.in/release", snippet: "Ministry", bucketIds: ["government_official"], score: 95 },
  ], "https://failed.example.com", new Set(["https://blog.example.com"]));

  assert.equal(backup?.url, "https://main.sci.gov.in/judgment");
});

test("selectBackupSource returns null when every candidate is failed or enriched", () => {
  const backup = selectBackupSource([
    { title: "Failed", url: "https://failed.example.com", bucketIds: ["court_legal"], score: 99 },
    { title: "Done", url: "https://done.example.com", bucketIds: ["court_legal"], score: 90 },
  ], "https://failed.example.com", new Set(["https://done.example.com"]));

  assert.equal(backup, null);
});

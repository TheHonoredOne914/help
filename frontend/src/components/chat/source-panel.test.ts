import test from "node:test";
import assert from "node:assert/strict";
import { inferTier, sourceBadge } from "./source-panel";

test("source panel badges use backend source classes", () => {
  assert.equal(sourceBadge("official_government"), "GOV");
  assert.equal(sourceBadge("parliamentary_records"), "PARL");
  assert.equal(sourceBadge("court_primary"), "COURT");
  assert.equal(sourceBadge("legal_commentary"), "LEGAL");
  assert.equal(sourceBadge("academic_journal"), "ACAD");
  assert.equal(sourceBadge("indian_major_media"), "MEDIA");
  assert.equal(sourceBadge("general_media"), "WEB");
});

test("source panel tiering treats backend court and official classes as high-trust", () => {
  assert.equal(inferTier({ title: "SC judgment", url: "https://example.com/judgment", sourceType: "court_primary" }), "tier1");
  assert.equal(inferTier({ title: "Sansad answer", url: "https://example.com/q", sourceType: "parliamentary_records" }), "tier2");
  assert.equal(inferTier({ title: "PIB brief", url: "https://example.com/x", sourceType: "official_government" }), "tier2");
});

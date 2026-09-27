import test from "node:test";
import assert from "node:assert/strict";
import { inferSourceTier, sourceBadgeLabel } from "@/lib/source-semantics";

test("source panel badges use backend source classes", () => {
  assert.equal(sourceBadgeLabel("official_government"), "GOV.IN");
  assert.equal(sourceBadgeLabel("parliamentary_records"), "PARL");
  assert.equal(sourceBadgeLabel("court_primary"), "COURT");
  assert.equal(sourceBadgeLabel("legal_commentary"), "LEGAL");
  assert.equal(sourceBadgeLabel("academic_journal"), "ACAD");
  assert.equal(sourceBadgeLabel("indian_major_media"), "MEDIA");
  assert.equal(sourceBadgeLabel("general_media"), "WEB");
});

test("source panel tiering treats backend court and official classes as high-trust", () => {
  assert.equal(inferSourceTier({ url: "https://example.com/judgment", sourceType: "court_primary" }), "tier1");
  assert.equal(inferSourceTier({ url: "https://example.com/q", sourceType: "parliamentary_records" }), "tier2");
  assert.equal(inferSourceTier({ url: "https://example.com/x", sourceType: "official_government" }), "tier2");
});

import test from "node:test";
import assert from "node:assert/strict";
import { isEvidenceShell } from "../../src/core/retrieval/enrichment/source-quality.js";

test("nav and cookie-banner snippets are rejected as evidence shells", () => {
  assert.equal(isEvidenceShell("Skip to content | Navigation | Privacy Policy | Terms of Use | Subscribe to newsletter"), true);
  assert.equal(isEvidenceShell("Cookie settings. Share this page. All rights reserved."), true);
});

test("substantive government snippet text is not treated as shell", () => {
  const snippet = "The Ministry of Health and Family Welfare reported that NFHS-5 documents rising obesity prevalence among adults across Indian states with measurable survey methodology.";
  assert.equal(isEvidenceShell(snippet), false);
});

test("short court letterhead alone is a shell but long judgments are not", () => {
  assert.equal(
    isEvidenceShell("IN THE SUPREME COURT OF INDIA CIVIL APPELLATE JURISDICTION REPORTABLE"),
    true,
  );
  const judgment = [
    "IN THE SUPREME COURT OF INDIA CIVIL APPELLATE JURISDICTION REPORTABLE",
    "The Election Commission may issue binding directions to political parties on labelled synthetic media during the Model Code of Conduct period.",
    "Platforms must remove notified deepfakes within three hours once the Commission verifies the complaint against the published URL and content hash.",
    "Privacy policy disclosures on campaign microsites do not displace statutory obligations under the Information Technology Act or Representation of the People Act.",
  ].join(" ");
  assert.ok(judgment.length >= 520);
  assert.equal(isEvidenceShell(judgment), false);
});

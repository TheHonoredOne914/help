import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { isArchiveContextSafeForAgenda } from "../../src/core/agenda/archive-safety.js";

const query = "Analyze India's declining democratic space from 2022-2025 through Freedom House, V-Dem, UAPA, FCRA, internet shutdowns, HRW, Amnesty, CIVICUS, Supreme Court responses, World Press Freedom Index, electoral integrity, EPW, MHA, The Hindu, and Indian Express.";

test("AI archive is excluded from India democratic-space agenda", () => {
  const contract = buildAgendaContract({ originalUserQuery: query });
  const report = isArchiveContextSafeForAgenda("Previous answer: AI governance, deepfakes, algorithmic bias, and generative AI regulation in democracy.", contract);

  assert.equal(report.safe, false);
  assert.equal(report.sanitizedArchiveText, "");
  assert.ok(report.excludedTerms.includes("generative AI"));
});

test("similar India democracy archive can be used only as low-trust background", () => {
  const contract = buildAgendaContract({ originalUserQuery: query });
  const report = isArchiveContextSafeForAgenda("Background notes: Freedom House and V-Dem describe India democratic backsliding; verify all references with fresh retrieval before citing.", contract);

  assert.equal(report.safe, true);
  assert.ok(report.overlapScore > 0.25);
  assert.match(report.sanitizedArchiveText, /Freedom House/);
  assert.equal(report.archiveCanBeCited, false);
});

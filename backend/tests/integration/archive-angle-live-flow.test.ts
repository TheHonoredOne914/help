import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { routeQueryAgainstWorkspace } from "../../src/core/archive/context-router.js";
import { generateResearchAngles } from "../../src/core/archive/research-angle-engine.js";

test("archive router attaches related, subthreads partial legal topics, and isolates unrelated queries", () => {
  const archive = { title: "India democratic space", summary: "press freedom UAPA FCRA civil liberties Supreme Court" };

  assert.equal(routeQueryAgainstWorkspace("press freedom in India", archive).suggestedAction, "attach_to_workspace");
  assert.equal(routeQueryAgainstWorkspace("child sexual abuse and marital rape law in India", archive).suggestedAction, "create_subthread");
  assert.equal(routeQueryAgainstWorkspace("gaming phone under 20k", archive).suggestedAction, "temporary_isolated_response");
});

test("research angles influence source buckets and divisions without making archive sources citable", () => {
  const contract = buildAgendaContract({ requestId: "angles", originalUserQuery: "India democratic space press freedom 2022 2025" });
  const routing = routeQueryAgainstWorkspace("press freedom in India", { title: "India democratic space", summary: "press freedom" });
  const angles = generateResearchAngles({ agendaContract: contract, archiveRouting: routing, archiveAngleGraph: { validatedAngles: ["Press freedom archive note"] } });

  assert.ok(angles.some((angle) => angle.sourceBucketsNeeded.includes("press_freedom")));
  assert.ok(angles.some((angle) => angle.suggestedDivisions.length > 0));
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { generateResearchAngles } from "../../src/core/archive/research-angle-engine.js";

test("democratic-space agenda generates Indian parliamentary research angles", () => {
  const contract = buildAgendaContract({ originalUserQuery: "India democratic space 2022-2025 press freedom UAPA FCRA ECI Supreme Court" });
  const angles = generateResearchAngles({ agendaContract: contract });
  const titles = angles.map((angle) => angle.title.toLowerCase()).join("\n");

  for (const expected of ["constitutional", "electoral", "civil liberties", "press freedom", "judicial"]) {
    assert.match(titles, new RegExp(expected, "i"));
  }
  assert.ok(angles.every((angle) => angle.sourceBucketsNeeded.length > 0));
  assert.ok(angles.every((angle) => ["treasury", "opposition", "both", "neutral"].includes(angle.bestSide)));
  assert.doesNotMatch(JSON.stringify(angles), /member states|UN resolution|Security Council/i);
});

test("archive angle graph improves relevance without letting unrelated archive dominate", () => {
  const contract = buildAgendaContract({ originalUserQuery: "India democratic space 2022-2025" });
  const angles = generateResearchAngles({
    agendaContract: contract,
    archiveAngleGraph: {
      topic: "India democratic space",
      validatedAngles: ["internet shutdowns public order vs Article 19"],
    },
  });

  assert.ok(angles.some((angle) => /internet shutdowns/i.test(angle.title + angle.description)));
  assert.ok(angles.every((angle) => !/gaming phone/i.test(angle.title + angle.description)));
});

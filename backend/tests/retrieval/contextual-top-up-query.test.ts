import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildContextualTopUpQuery, type RetrievalSource } from "../../src/core/retrieval/bucketed-retrieval.js";

test("top-up query uses agenda keywords and targeted domains", () => {
  const contract = buildAgendaContract({ originalUserQuery: "India democratic space Supreme Court ECI press freedom 2024" });
  const query = buildContextualTopUpQuery("court_legal", contract, [{
    title: "Anuradha Bhasin and internet shutdowns",
    snippet: "Supreme Court of India judgment",
    url: "https://example.com",
    bucketId: "court_legal",
    foundByQuery: "x",
    domain: "example.com",
    bucketIds: ["court_legal"],
    foundByQueries: ["x"],
    score: 80,
    sourceClass: "court_primary",
    scoreReasons: [],
  } as RetrievalSource]);

  assert.match(query, /site:sci\.gov\.in|indiankanoon/i);
  assert.match(query, /Supreme|Court|ECI|democratic|space/i);
  assert.doesNotMatch(query, /\{bucketId\}|source evidence$/i);
});

test("contextual top-up query ignores JavaScript and 404 shell entities", () => {
  const contract = buildAgendaContract({
    originalUserQuery: "Election Commission Union Government online political advertising deepfakes platform transparency",
  });
  const query = buildContextualTopUpQuery("policy_research", contract, [{
    title: "Election Commission of India Ooops... Page not found",
    snippet: "Page Ooops Back ECI PDF Advisory Political Any You need to enable JavaScript to run this app",
    url: "https://www.eci.gov.in/bad-shell",
    bucketId: "policy_research",
    foundByQuery: "x",
    domain: "eci.gov.in",
    bucketIds: ["policy_research"],
    foundByQueries: ["x"],
    score: 80,
    sourceClass: "official_government",
    scoreReasons: [],
  } as RetrievalSource]);

  assert.match(query, /Election Commission|deepfakes|platform transparency/i);
  assert.doesNotMatch(query, /\b(?:Ooops|Oops|Page|Back|JavaScript|Javascript|PDF|Advisory|Any|run this app)\b/i);
});

test("contextual top-up query variants stay distinct across repair passes", () => {
  const contract = buildAgendaContract({
    originalUserQuery: "GST Council compensation cess federal finance India",
  });
  const baseResults: RetrievalSource[] = [];

  const first = buildContextualTopUpQuery("government_official", contract, baseResults, 0);
  const later = buildContextualTopUpQuery("government_official", contract, baseResults, 3);

  assert.notEqual(first, later);
  assert.match(later, /committee evidence/i);
});

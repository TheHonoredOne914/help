import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { filterSourcesForAgenda } from "../../src/core/retrieval/source-filter.js";
import { scoreSourceForAgenda } from "../../src/core/retrieval/source-scoring.js";

const contract = buildAgendaContract({ originalUserQuery: "India democratic space 2022 2025 Freedom House V-Dem UAPA FCRA Supreme Court ECI RSF" });

test("source scoring ranks official court and index sources high while penalizing drift", () => {
  assert.ok(scoreSourceForAgenda({ url: "https://api.sci.gov.in/judgment.pdf", title: "Supreme Court judgment", snippet: "India VVPAT judgment" }, contract).score >= 95);
  assert.ok(scoreSourceForAgenda({ url: "https://freedomhouse.org/country/india/freedom-world/2025", title: "India Freedom House", snippet: "India democracy score" }, contract).score >= 90);
  assert.ok(scoreSourceForAgenda({ url: "https://randomblog.example/ai-democracy", title: "Generative AI democracy", snippet: "algorithmic bias and AI governance" }, contract).score < 40);
});

test("source filter rejects low quality and drift sources but preserves legal precedents", () => {
  const filtered = filterSourcesForAgenda([
    { url: "https://quora.com/india-democracy", title: "Quora answer", snippet: "opinion" },
    { url: "https://main.sci.gov.in/anuradha-bhasin.pdf", title: "Anuradha Bhasin", snippet: "internet shutdown Supreme Court India" },
    { url: "https://example.com/ai-democracy", title: "AI governance", snippet: "generative AI and deepfakes" },
  ], contract);

  assert.deepEqual(filtered.map((source) => source.url), ["https://main.sci.gov.in/anuradha-bhasin.pdf"]);
});

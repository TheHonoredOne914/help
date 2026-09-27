import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCitationParts,
  prepareMessageForCopy,
} from "./citation-parts";
import { citationPartsToMarkdown } from "./research-answer-body";

const contentWithMetadata = `Answer [1].

<!--BESTDEL_PIPELINE_START-->
{"runId":"run-1","sources":[{"sourceId":1,"title":"PIB","url":"https://pib.gov.in/x"}]}
<!--BESTDEL_PIPELINE_END-->`;

test("copy preparation strips hidden pipeline metadata", () => {
  assert.equal(prepareMessageForCopy(contentWithMetadata), "Answer [1].");
});

test("citation parts prefer backend citationStatus over regex-only linking", () => {
  const parts = buildCitationParts({
    content: "Claim [Source 1]. Unsupported marker [2].",
    sources: [
      { sourceId: 1, title: "PIB", url: "https://pib.gov.in/brief" },
      { sourceId: 2, title: "Blog", url: "https://example.com/blog" },
    ],
    citationStatus: {
      finalUniqueCitedSources: 1,
      totalLinkedCitations: 1,
      citedSourceIds: [1],
      citationCoverage: 1,
    },
  });

  const linked = parts.filter((part) => part.type === "source").map((part) => part.n);
  const plain = parts.filter((part) => part.type === "text").map((part) => part.text).join("");

  assert.deepEqual(linked, ["1"]);
  assert.match(plain, /\[2\]/);
});

test("citationPartsToMarkdown turns trusted citations into markdown links", () => {
  const { markdown, sourcesBlock } = citationPartsToMarkdown(
    "## Finding\n\nClaim [Source 1] holds.\n\n## Sources\n1. https://pib.gov.in/brief",
    [{ sourceId: 1, title: "PIB", url: "https://pib.gov.in/brief" }],
    null,
  );

  assert.match(markdown, /\[1\]\(https:\/\/pib\.gov\.in\/brief\)/);
  assert.match(markdown, /## Finding/);
  assert.ok(sourcesBlock?.includes("pib.gov.in"));
});

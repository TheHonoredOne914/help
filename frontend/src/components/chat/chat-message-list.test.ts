import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCitationParts,
  prepareMessageForCopy,
} from "./chat-message-list";

const contentWithMetadata = `Answer [1].

<!--BESTDEL_PIPELINE_START-->
{"runId":"run-1","sources":[{"sourceId":1,"title":"PIB","url":"https://pib.gov.in/x"}]}
<!--BESTDEL_PIPELINE_END-->`;

test("copy preparation strips hidden pipeline metadata", () => {
  assert.equal(prepareMessageForCopy(contentWithMetadata), "Answer [1].");
});

test("citation parts prefer backend citationStatus over regex-only linking", () => {
  const parts = buildCitationParts({
    content: "Claim [1]. Unsupported marker [2].",
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

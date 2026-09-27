import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ResearchAnswerBody } from "./research-answer-body";

const VALID_BAR_CHART = JSON.stringify({
  type: "bar",
  title: "NFHS-6",
  xKey: "group",
  series: [{ key: "pct", label: "%" }],
  data: [
    { group: "Women", pct: 30.7 },
    { group: "Men", pct: 27.3 },
  ],
});

test("chart fence renders outside markdown pre wrapper", () => {
  const html = renderToStaticMarkup(
    <ResearchAnswerBody content={`\`\`\`bestdel-chart\n${VALID_BAR_CHART}\n\`\`\``} />,
  );

  assert.match(html, /data-bestdel-chart="bar"/);
  assert.doesNotMatch(html, /<pre[^>]*>[\s\S]*data-bestdel-chart/);
});

test("language-chart alias also unwraps from markdown pre", () => {
  const html = renderToStaticMarkup(
    <ResearchAnswerBody content={`\`\`\`chart\n${VALID_BAR_CHART}\n\`\`\``} />,
  );

  assert.match(html, /data-bestdel-chart="bar"/);
  assert.doesNotMatch(html, /<pre[^>]*>[\s\S]*data-bestdel-chart/);
});

test("ordinary fenced code still uses pre wrapper", () => {
  const html = renderToStaticMarkup(
    <ResearchAnswerBody content={"```javascript\nconst x = 1;\n```"} />,
  );

  assert.match(html, /<pre><code class="language-javascript"[^>]*>const x = 1;/);
});

test("invalid chart spec falls back to a single pre/code block", () => {
  const html = renderToStaticMarkup(
    <ResearchAnswerBody content={"```bestdel-chart\n{not json\n```"} />,
  );

  assert.match(html, /<pre[^>]*><code>\{not json<\/code><\/pre>/);
  assert.equal((html.match(/<pre/g) ?? []).length, 1);
});

test("fixture sources footer matches cited sources and chips are in-page buttons", () => {
  const content = `Claim [Source 1] and support [Source 2].

## Sources
  1. Press Information Bureau: https://pib.gov.in/a
2. PRS Legislative Research — https://prsindia.org/b
`;
  const html = renderToStaticMarkup(
    <ResearchAnswerBody
      content={content}
      sources={[
        { sourceId: 1, title: "Press Information Bureau brief", url: "https://pib.gov.in/a" },
        { sourceId: 2, title: "PRS Legislative Research note", url: "https://prsindia.org/b" },
      ]}
      citationStatus={{ finalUniqueCitedSources: 2, totalLinkedCitations: 2, citedSourceIds: [1, 2], citationCoverage: 1 }}
    />,
  );

  assert.match(html, /Sources \(2\)/);
  assert.doesNotMatch(html, />0</);
  assert.match(html, /<button[^>]*aria-label="Source 1: Press Information Bureau brief"/);
  assert.doesNotMatch(html, /<a[^>]*target="_blank"[^>]*>\[1\]/);
  assert.match(html, /Open original/);
});

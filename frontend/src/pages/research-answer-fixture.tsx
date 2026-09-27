import { CitationMessage } from "@/components/chat/chat-message-list";

const FIXTURE_CONTENT = `## Opening argument

The Order Paper should treat **source-backed claims** as first-class evidence, not decorative footnotes.[1]

### Key findings

1. Primary briefings still outrank secondary commentary when stakes are high.[2]
2. Citation chips must remain clickable and scroll to the matching source row.
3. Lists, headings, and blockquotes should render with Order Paper typography.

### Obesity prevalence (example chart)

\`\`\`bestdel-chart
{"type":"bar","title":"NFHS-6 overweight/obesity (15-49)","xKey":"group","series":[{"key":"pct","label":"%"}],"data":[{"group":"Women","pct":30.7},{"group":"Men","pct":27.3}],"cite":1}
\`\`\`

Women 30.7% vs men 27.3% [1] **because** dietary shift and sedentary work raise BMI risk.

> Parliament debates improve when every contested number carries a verifiable cite.[1]

| Claim | Support |
| --- | --- |
| PIB brief is authoritative | [1] |
| PRS note adds legislative context | [2] |

## Sources
  1. Press Information Bureau: https://pib.gov.in/PressReleasePage.aspx?PRID=2000001
2. PRS Legislative Research — https://prsindia.org/billtrack/sample-brief
`;

const FIXTURE_SOURCES = [
  {
    sourceId: 1,
    title: "Press Information Bureau brief",
    url: "https://pib.gov.in/PressReleasePage.aspx?PRID=2000001",
  },
  {
    sourceId: 2,
    title: "PRS Legislative Research note",
    url: "https://prsindia.org/billtrack/sample-brief",
  },
];

const FIXTURE_CITATION_STATUS = {
  finalUniqueCitedSources: 2,
  totalLinkedCitations: 4,
  citedSourceIds: [1, 2],
  citationCoverage: 1,
};

/** Dev-only visual fixture for ResearchAnswerBody / citation chips. */
export default function ResearchAnswerFixturePage() {
  return (
    <main className="min-h-screen bg-[var(--paper)] px-6 py-10 text-[var(--ink)]">
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--slate)]">
          Research answer fixture
        </p>
        <h1 className="font-serif text-2xl text-[var(--ink)]">CitationMessage / ResearchAnswerBody</h1>
        <div
          className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm"
          data-testid="research-answer-fixture"
        >
          <CitationMessage
            content={FIXTURE_CONTENT}
            sources={FIXTURE_SOURCES}
            citationStatus={FIXTURE_CITATION_STATUS}
          />
        </div>
      </div>
    </main>
  );
}

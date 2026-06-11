import { classifyTopic, type TopicType } from "./rag.js";

interface ComposeAnthropicSystemPromptOptions {
  archiveTopic?: string | null;
  archiveSummary?: string | null;
  userSystemPrompt?: string | null;
}

function filterSummaryForTopic(summary: string, topicClass: TopicType): string {
  if (topicClass === "governance_policy") return summary;

  const lines = summary.split("\n").map(l => l.trim()).filter(Boolean);

  const topicKeywords: Partial<Record<TopicType, RegExp>> = {
    democracy_civil_liberties: /freedom|democracy|civil|rights|press|ranking|index|decline|erosion|amnesty|hrw|rsf|uapa|sedition|arrested|detained|shutdown|crackdown|dissent|ngos?|fcra|minority|election/i,
    media_press: /journalist|press|media|article 19|sedition|censorship|rsf|cpj|freedom house|newsroom|reporter/i,
    economic: /gdp|budget|fiscal|inflation|trade|rbi|monetary|gst|tax|growth|poverty|imf|world bank|crore|lakh|billion|million/i,
    environment: /climate|carbon|emission|pollution|forest|renewable|solar|wind|energy|temperature|ipcc|cop|paris/i,
    legal: /court|judg|constitution|article \d+|section \d+|act|parliament|writ|pil|verdict|bench/i,
    security: /defence|military|terror|border|missile|nuclear|nato|sipri|mea|ceasefire/i,
  };

  const pattern = topicKeywords[topicClass];
  if (!pattern) return summary;

  const filtered = lines.filter(line => pattern.test(line));
  return filtered.length > 0 ? filtered.join("\n") : "";
}

export function buildArchiveContextPrompt(topic: string, summary: string): string {
  const topicClass = classifyTopic(topic + " " + topic);

  let sourceGuidance: string;

  if (topicClass === "democracy_civil_liberties") {
    sourceGuidance = [
      "For this archive topic, prefer: Freedom House, V-Dem, EIU Democracy Index, HRW, Amnesty, CIVICUS, Article 14, IFF, investigative media (The Wire, Scroll.in, Article 14).",
      "Do NOT treat PIB or official audit/crime-stat data as primary evidence for this topic — the government is the subject of scrutiny, not the authority.",
      "Label any government statement explicitly as 'the government's position' or 'official government claim'.",
    ].join("\n");
  } else if (topicClass === "media_press") {
    sourceGuidance = [
      "For this archive topic, prefer: RSF Press Freedom Index, CPJ incident data, Freedom House, HRW, MediaNama, The Wire, Scroll.in, indiankanoon.org for Article 19 cases.",
      "Government statements via PIB are one side of the debate — label them as such, not as fact.",
    ].join("\n");
  } else if (topicClass === "economic") {
    sourceGuidance = "For this archive topic, prefer: RBI, MoSPI, NITI Aayog, Union Budget, World Bank, IMF India data, indiabudget.gov.in.";
  } else if (topicClass === "legal") {
    sourceGuidance = "For this archive topic, prefer: indiankanoon.org, livelaw.in, Bar & Bench, Supreme Court official records, prsindia.org for committee reports.";
  } else if (topicClass === "environment") {
    sourceGuidance = "For this archive topic, prefer: MoEFCC, CPCB, IPCC, India NDC, FSI forest reports, MNRE data, UN Environment.";
  } else if (topicClass === "security") {
    sourceGuidance = "For this archive topic, prefer: MEA official statements, SIPRI, UN Security Council records, IDSA, official Indian defence data.";
  } else {
    sourceGuidance = "For this archive topic, prefer: Indian government data, court judgements, CAG, NCRB, PIB, MEA, Parliament, and official reports.";
  }

  const blocks = [
    `Active archive topic: ${topic.trim()}`,
    "Treat this archive topic as shared project context across chats.",
    sourceGuidance,
  ];

  if (summary.trim()) {
    const filteredSummary = filterSummaryForTopic(summary.trim(), topicClass);
    if (filteredSummary) {
      blocks.push("Archive distilled facts:");
      blocks.push("(from previous conversations in this archive)");
      blocks.push(filteredSummary.slice(0, 2200));
    }
  }

  return blocks.join("\n");
}

export function composeAnthropicSystemPrompt({
  archiveTopic,
  archiveSummary,
  userSystemPrompt,
}: ComposeAnthropicSystemPromptOptions): string {
  const topic = archiveTopic?.trim() ?? "";
  const summary = archiveSummary?.trim() ?? "";
  const customPrompt = userSystemPrompt?.trim() ?? "";

  if (!topic) return customPrompt;

  const archivePrompt = buildArchiveContextPrompt(topic, summary);
  return [archivePrompt, customPrompt].filter(Boolean).join("\n\n");
}

import type { CommitteeType, DimensionName } from "../lib/types.js";

export interface EvalSuite {
  agendaText: string;
  committeeType: CommitteeType;
  expectedDimensions: DimensionName[];
  requiredSources: string[];
  requiredDivisions: string[];
  minimumCitations: number;
  minimumWordCount: number;
  mustContain: string[];
  mustNotContain: string[];
}

export interface EvalResult {
  suite: string;
  passed: boolean;
  failures: string[];
}

export const EVAL_SUITES: EvalSuite[] = [
  {
    agendaText: "Discussing the constitutional validity of the Citizenship Amendment Act, 2019",
    committeeType: "constitutional",
    expectedDimensions: ["constitutional", "human_rights", "political"],
    requiredSources: ["indiankanoon.org", "gov.in"],
    requiredDivisions: ["core_brief", "analytical_dimensions", "debate_utility"],
    minimumCitations: 10,
    minimumWordCount: 3000,
    mustContain: ["Article 14", "fundamental rights", "Writ Petition"],
    mustNotContain: ["[Source 99]", "as per various sources", "many experts believe"],
  },
  {
    agendaText: "Centre-state fiscal federalism and GST compensation disputes",
    committeeType: "aippm",
    expectedDimensions: ["federalism", "economic", "political"],
    requiredSources: ["rbi.org.in", "prsindia.org", "gov.in"],
    requiredDivisions: ["core_brief", "stakeholder_mapping", "debate_utility"],
    minimumCitations: 8,
    minimumWordCount: 2200,
    mustContain: ["GST Council", "fiscal devolution"],
    mustNotContain: ["unverified estimate", "[Source 99]"],
  },
  {
    agendaText: "India-China border negotiations and diplomatic de-escalation",
    committeeType: "foreign_affairs",
    expectedDimensions: ["diplomatic", "security", "strategic_affairs"],
    requiredSources: ["mea.gov.in", "thehindu.com"],
    requiredDivisions: ["core_brief", "conflict_mapping", "strategic_insights"],
    minimumCitations: 8,
    minimumWordCount: 2200,
    mustContain: ["LAC", "de-escalation"],
    mustNotContain: ["many experts believe"],
  },
  {
    agendaText: "Emergency response to communal unrest and misinformation during a crisis",
    committeeType: "crisis",
    expectedDimensions: ["security", "social_stability", "media_information"],
    requiredSources: ["mha.gov.in", "indiankanoon.org"],
    requiredDivisions: ["core_brief", "conflict_mapping", "debate_utility"],
    minimumCitations: 8,
    minimumWordCount: 2000,
    mustContain: ["public order", "misinformation"],
    mustNotContain: ["as per various sources"],
  },
  {
    agendaText: "Assessing unemployment and inflation policy responses in India",
    committeeType: "economic",
    expectedDimensions: ["economic", "governance", "political"],
    requiredSources: ["rbi.org.in", "mospi.gov.in", "indiabudget.gov.in"],
    requiredDivisions: ["core_brief", "analytical_dimensions", "policy_pathways"],
    minimumCitations: 10,
    minimumWordCount: 2500,
    mustContain: ["inflation", "employment"],
    mustNotContain: ["[Source 99]"],
  },
  {
    agendaText: "Analyzing civil liberties and democratic space in India from 2022 to 2025",
    committeeType: "human_rights",
    expectedDimensions: ["human_rights", "constitutional", "media_information"],
    requiredSources: ["freedomhouse.org", "v-dem.net", "hrw.org"],
    requiredDivisions: ["core_brief", "evidence_verification", "strategic_insights"],
    minimumCitations: 12,
    minimumWordCount: 3000,
    mustContain: ["Freedom House", "V-Dem", "civil liberties"],
    mustNotContain: ["thehuman-rights.com", "India's Official Position"],
  },
];

export async function runEvalSuite(suite: EvalSuite, runResearch: (agenda: string, committee: CommitteeType) => Promise<string>): Promise<EvalResult> {
  const output = await runResearch(suite.agendaText, suite.committeeType);
  const failures: string[] = [];
  const wordCount = output.trim().split(/\s+/).filter(Boolean).length;
  const citationCount = output.match(/\[Source \d+\]\(https?:\/\/[^)]+\)/g)?.length ?? 0;

  if (wordCount < suite.minimumWordCount) failures.push(`word count ${wordCount} < ${suite.minimumWordCount}`);
  if (citationCount < suite.minimumCitations) failures.push(`citation count ${citationCount} < ${suite.minimumCitations}`);
  for (const phrase of suite.mustContain) if (!output.toLowerCase().includes(phrase.toLowerCase())) failures.push(`missing phrase: ${phrase}`);
  for (const phrase of suite.mustNotContain) if (output.toLowerCase().includes(phrase.toLowerCase())) failures.push(`forbidden phrase present: ${phrase}`);
  for (const domain of suite.requiredSources) if (!output.toLowerCase().includes(domain.toLowerCase())) failures.push(`required source missing: ${domain}`);

  return { suite: suite.agendaText, passed: failures.length === 0, failures };
}

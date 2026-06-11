import { runDimensionEngine } from "./dimension-engine.js";
import type { CommitteeType, DimensionEngineOutput, DimensionName } from "./types.js";
import type { TopicType } from "./rag.js";

export type PrimarySignal = "constitutional" | "security" | "economic" | "rights" | "media" | "governance";

export interface TopicSourceStrategy {
  primaryDomains: string[];
  secondaryDomains: string[];
  avoidDomains: string[];
  requiresGovernmentCounterNarrative: boolean;
}

export interface AgendaIntelligence {
  topicType: TopicType;
  dimensionOutput: DimensionEngineOutput;
  committeeType: CommitteeType;
  primarySignal: PrimarySignal;
  sourceStrategy: TopicSourceStrategy;
}

export function inferCommitteeTypeFromAgenda(input: string): CommitteeType {
  const q = input.toLowerCase();
  if (/\byouth parliament\b|bharatiya chhatra sansad|student parliament/.test(q)) return "youth_parliament";
  if (/\baippm\b|all india political parties/.test(q)) return "aippm";
  if (/\blok sabha\b/.test(q)) return "lok_sabha";
  if (/\brajya sabha\b/.test(q)) return "rajya_sabha";
  if (/\bnational security\b|nsc\b|security council\b|mha\b|defen[cs]e\b/.test(q)) return "national_security";
  if (/\bconstitutional\b|article \d+|basic structure|supreme court\b/.test(q)) return "constitutional";
  if (/\bcrisis\b|emergency\b|unrest\b|riot\b|standoff\b/.test(q)) return "crisis";
  if (/\bhuman rights\b|nhrc\b|minority rights\b|civil liberties\b/.test(q)) return "human_rights";
  if (/\beconomic\b|budget\b|fiscal\b|gst\b|rbi\b/.test(q)) return "economic";
  if (/\bforeign affairs\b|mea\b|diplomatic\b|bilateral\b|unsc\b|un general assembly\b/.test(q)) return "foreign_affairs";
  if (/\bpublic policy\b|governance\b|scheme\b|implementation\b/.test(q)) return "public_policy";
  
  // Expanded inference patterns
  if (/\bvidhan sabha\b|\bstate legislature\b/.test(q)) return "aippm"; // closest match
  if (/\bstanding committee on finance\b|\bpac\b|\bpublic accounts committee\b/.test(q)) return "economic";
  if (/\bjoint committee\b|\bselect committee\b/.test(q)) return "constitutional";
  if (/\bjpc\b/.test(q)) return "constitutional"; // Joint Parliamentary Committee
  if (/\bpsc\b|\bpublic service commission\b/.test(q)) return "general";
  if (/\brsb\b|\brailway\b/.test(q)) return "public_policy";
  if (/\benvironment\b|\bclimate\b|\becology\b|\bforest\b/.test(q)) return "public_policy";
  
  return "general";
}

export function classifyAgenda(
  agendaText: string,
  userSystemPrompt: string,
  archiveTopic?: string
): AgendaIntelligence {
  const committeeType = inferCommitteeTypeFromAgenda(`${archiveTopic ?? ""} ${agendaText}`);
  const dimensionOutput = runDimensionEngine(agendaText, committeeType, userSystemPrompt);
  const topicType = deriveTopicFromDimensions(dimensionOutput);
  const primarySignal = mapDimensionToSignal(dimensionOutput.primaryDimensions[0]?.name);
  const sourceStrategy = buildTopicSourceStrategyFromSignal(primarySignal, topicType);

  return { topicType, dimensionOutput, committeeType, primarySignal, sourceStrategy };
}

export function deriveTopicFromDimensions(engine: DimensionEngineOutput): TopicType {
  const primary = new Set(engine.primaryDimensions.map(d => d.name));
  if (primary.has("media_information")) return "media_press";
  if (primary.has("human_rights") && (primary.has("constitutional") || primary.has("judiciary"))) {
    return "democracy_civil_liberties";
  }
  if (primary.has("constitutional") || primary.has("judiciary")) return "legal";
  if (primary.has("economic")) return "economic";
  if (primary.has("security") || primary.has("strategic_affairs")) return "security";
  if (primary.has("diplomatic") || primary.has("international_relations")) return "governance_policy";
  return "governance_policy";
}

export function mapDimensionToSignal(dimension?: DimensionName): PrimarySignal {
  switch (dimension) {
    case "constitutional":
    case "judiciary":
      return "constitutional";
    case "security":
    case "strategic_affairs":
      return "security";
    case "economic":
      return "economic";
    case "human_rights":
      return "rights";
    case "media_information":
      return "media";
    default:
      return "governance";
  }
}

export function buildTopicSourceStrategyFromSignal(signal: PrimarySignal, topicType: TopicType): TopicSourceStrategy {
  if (topicType === "democracy_civil_liberties" || signal === "rights") {
    return {
      primaryDomains: ["freedomhouse.org", "v-dem.net", "hrw.org", "amnesty.org", "civicus.org", "idea.int", "article14.com"],
      secondaryDomains: ["indiankanoon.org", "thehindu.com", "indianexpress.com", "scroll.in", "thewire.in"],
      avoidDomains: ["pib.gov.in", "cag.gov.in", "ncrb.gov.in"],
      requiresGovernmentCounterNarrative: true,
    };
  }
  if (topicType === "media_press" || signal === "media") {
    return {
      primaryDomains: ["rsf.org", "cpj.org", "freedomhouse.org", "hrw.org"],
      secondaryDomains: ["medianama.com", "thewire.in", "scroll.in", "indiankanoon.org"],
      avoidDomains: ["cag.gov.in", "ncrb.gov.in"],
      requiresGovernmentCounterNarrative: true,
    };
  }
  if (signal === "constitutional") {
    return {
      primaryDomains: ["indiankanoon.org", "sci.gov.in", "livelaw.in", "barandbench.com"],
      secondaryDomains: ["prsindia.org", "sansad.in", "thehindu.com"],
      avoidDomains: [],
      requiresGovernmentCounterNarrative: false,
    };
  }
  return {
    primaryDomains: ["pib.gov.in", "mea.gov.in", "cag.gov.in", "ncrb.gov.in", "prsindia.org"],
    secondaryDomains: ["indiankanoon.org", "thehindu.com", "indianexpress.com"],
    avoidDomains: [],
    requiresGovernmentCounterNarrative: false,
  };
}

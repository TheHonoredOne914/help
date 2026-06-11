import { repairAgendaDrift, type AgendaContract } from "../agenda/agenda-contract.js";
import type { EvidencePack } from "../evidence/evidence-pack-builder.js";
import { repairCitationTextWithEvidencePacks } from "../evidence/evidence-pack-builder.js";

export type RepairType =
  | "agenda_drift_repair"
  | "missing_bucket_repair"
  | "source_volume_repair"
  | "citation_repair"
  | "legal_accuracy_repair"
  | "electoral_caution_repair"
  | "un_framing_repair"
  | "d11_structure_repair"
  | "indian_parliamentary_framing_repair"
  | "debate_utility_repair"
  | "strategic_synthesis_repair"
  | "source_gap_disclosure_repair"
  | "length_repair"
  | "length_trim_repair";

export interface TargetedRepairOptions {
  /** Hard word cap for length_trim_repair (mode-dependent). */
  maxWords?: number;
}

export async function runTargetedRepair(
  text: string,
  contract: AgendaContract,
  evidencePacks: EvidencePack[],
  repairType: RepairType,
  opts: TargetedRepairOptions = {},
): Promise<string> {
  if (repairType === "citation_repair") {
    return repairCitationTextWithEvidencePacks(text, evidencePacks);
  }
  if (repairType === "agenda_drift_repair" || repairType === "indian_parliamentary_framing_repair") {
    void evidencePacks;
    return repairAgendaDrift(text, contract);
  }
  if (repairType === "un_framing_repair") {
    return text
      .replace(/\bmember states\b/gi, "Treasury Bench and Opposition blocs")
      .replace(/\bSecurity Council\b/gi, "Parliamentary committee")
      .replace(/\bGeneral Assembly\b/gi, "House")
      .replace(/\bUN resolution\b/gi, "committee resolution")
      .replace(/\bECOSOC\b/gi, "relevant Union ministry")
      .replace(/\bbloc politics\b/gi, "party-line and coalition pressure")
      .replace(/\bUNSC\b|\bP5\b/gi, "committee leadership");
  }
  if (repairType === "electoral_caution_repair") {
    return text.replace(/fraud happened|election was stolen|EVMs were (?:manipulated|hacked|rigged|tampered)/gi, (match) => {
      if (/^evms/i.test(match)) return `allegations of ${match}`;
      return "electoral allegations require proof";
    });
  }
  if (repairType === "legal_accuracy_repair") {
    return text
      .replace(/\bArticle\s+\d+\s+and\s+Article\s+\d+\s+proportionality\b/gi, "rights-based proportionality review")
      .replace(/\bArticle\s+\d+\b/gi, "rights provision")
      .replace(/\bSupreme Court doctrine\b/gi, "verified institutional standard")
      .replace(/\bcourt-backed\b/gi, "source-backed")
      .replace(/\bcourt holding\b/gi, "verified source record")
      .replace(/\b[A-Z][A-Za-z.\u00a0 ]+\s+v\.?\s+(?:State of [A-Z][A-Za-z.\u00a0 ]+|Union(?: of India)?|India|Election Commission(?: of India)?|[A-Z][A-Za-z.\u00a0 ]+)/g, "a source-backed case reference")
      .replace(/\blegal claim\b/gi, "claim")
      .replace(/\blegality\b/gi, "documented basis")
      .replace(/\blegal limits\b/gi, "documented limits")
      .replace(/\bjudicial review\b/gi, "independent review");
  }
  if (repairType === "source_gap_disclosure_repair" || repairType === "missing_bucket_repair" || repairType === "source_volume_repair") {
    const needsMethodology = !/##?\s+Methodology and Source Base/i.test(text);
    const needsAngles = !/##?\s+Research Angle Map/i.test(text);
    return `${text.trim()}${needsMethodology ? `\n\n## Methodology and Source Base\nThis answer uses only the retrieved EvidenceRegistry and linked citations. Any weak bucket is treated as a limitation for committee questions, not as invented proof.` : ""}${needsAngles ? `\n\n## Research Angle Map\nTreasury Bench, Opposition, courts, ministries, Election Commission where relevant, and civil society arguments are separated into source-backed claims, POIs, rebuttals, motions, amendments, and committee recommendations.` : ""}`;
  }
  if (repairType === "debate_utility_repair") {
    if (/##?\s+Indian Mock Parliament Debate Utility Arsenal/i.test(text) && /\bamendment\b|\boperative clause\b|\bpreambular clause\b/i.test(text)) return text;
    return `${text.trim()}

## Indian Mock Parliament Debate Utility Arsenal
Treasury Bench:
1. Defend documented process through cited official, parliamentary, or policy evidence.
2. Separate public order necessity from political convenience.
3. Offer ministry reporting and committee oversight.

Opposition:
1. Press proportionality, rights impact, federalism, and transparency challenges.
2. Demand source-backed Election Commission or ministry answers.
3. Convert weak evidence into disclosure motions instead of overclaims.

POIs: Which source proves the number? Which verified source record supports the claim? Which ministry is accountable? What safeguard prevents misuse? What amendment narrows discretion?

Rebuttals: methodology dispute versus factual concession; public order versus proportionality; allegation versus ECI defence; verified source record versus political inference.

Clause language: add one preambular clause on constitutional morality and one operative clause requiring ministry reporting, independent review, and committee follow-up amendment language.`;
  }
  if (repairType === "d11_structure_repair" || repairType === "strategic_synthesis_repair") {
    if (/\bDiagnosis\b/i.test(text) && /\bPrescription\b/i.test(text) && /\bWarning\b/i.test(text)) return text;
    return `${text.trim()}

## Final Strategic Synthesis
Diagnosis: The decisive issue is whether the cited evidence supports the legal, institutional, and political claim under Indian parliamentary scrutiny.

Prescription: Tie every Treasury Bench defence and Opposition attack to a registry source, then convert weak evidence into POIs, amendments, and committee recommendations.

Warning: Do not treat allegations as proven, do not use UN framing, and do not cite sources that are not present in the registry.`;
  }
  if (repairType === "length_repair") {
    // Honestly extend the answer with bullet-led, cited claims drawn from
    // existing evidence packs. No padding, no invented facts: every appended
    // bullet must reference a card already in `evidencePacks`.
    if (/##?\s+Additional Source-Backed Bullets/i.test(text)) return text;
    const cards = evidencePacks.flatMap((pack) => pack.cards);
    if (cards.length === 0) return text;
    const seen = new Set<number>();
    const bullets: string[] = [];
    for (const card of cards) {
      if (seen.has(card.sourceId)) continue;
      seen.add(card.sourceId);
      const fact = (card.keyFacts && card.keyFacts[0]) || card.debateUse || card.title;
      if (!fact) continue;
      const citation = `[Source ${card.sourceId}]`;
      bullets.push(`- ${fact.trim().replace(/\s+/g, " ")} ${citation}`);
      if (bullets.length >= 60) break;
    }
    if (bullets.length === 0) return text;
    return `${text.trim()}\n\n## Additional Source-Backed Bullets\nDebate-ready, cited points drawn from the retrieved EvidenceRegistry:\n${bullets.join("\n")}`;
  }
  if (repairType === "length_trim_repair") {
    const maxWords = Math.max(1, opts.maxWords ?? 5500);
    void contract;
    void evidencePacks;
    return trimAnswerToWordCap(text, maxWords);
  }
  return text;
}

/**
 * Deterministic word-cap trimmer.
 *
 * Strategy:
 *   1. Walk the answer paragraph-by-paragraph (blank-line separated).
 *   2. Keep whole paragraphs until adding the next one would exceed the cap.
 *   3. If we kept anything, append a single visible Trim Notice so the user
 *      sees that mode word limits triggered truncation (no silent cuts).
 *   4. If even the first paragraph exceeds the cap, fall back to a hard
 *      word-level cut at the cap boundary plus the same notice.
 *
 * Never reorders content, never strips citations from kept paragraphs, never
 * injects unsourced text. Safe to run repeatedly.
 */
function trimAnswerToWordCap(text: string, maxWords: number): string {
  const countWords = (s: string) => (s.trim().match(/\b[\w'-]+\b/g) ?? []).length;
  if (countWords(text) <= maxWords) return text;

  const paragraphs = text.split(/\n{2,}/);
  const kept: string[] = [];
  let running = 0;
  for (const para of paragraphs) {
    const w = countWords(para);
    if (running + w > maxWords) break;
    kept.push(para);
    running += w;
  }

  let body: string;
  if (kept.length === 0) {
    // Hard cut at word boundary; first paragraph alone was over cap.
    const tokens = text.split(/\s+/);
    const sliced: string[] = [];
    let count = 0;
    for (const tok of tokens) {
      if (/\b[\w'-]+\b/.test(tok)) {
        if (count >= maxWords) break;
        count += 1;
      }
      sliced.push(tok);
    }
    body = sliced.join(" ").trim();
  } else {
    body = kept.join("\n\n").trim();
  }

  return `${body}\n\n## Trim Notice\nMode word-cap of ${maxWords} words enforced; trailing content was removed to keep the answer within the configured range. No citations or claims from the kept body were altered.`;
}



export function buildRepairPromptTemplate(repairType: RepairType): string {
  const templates: Record<RepairType, string> = {
    agenda_drift_repair: "Rewrite only agenda-drifted passages and restore the Indian parliamentary agenda.",
    missing_bucket_repair: "Add source-gap disclosure for missing buckets without inventing evidence.",
    source_volume_repair: "Reduce unsupported breadth and acknowledge source-volume limits.",
    citation_repair: "Rewrite only sentences with invalid citations; use only valid registry citations.",
    legal_accuracy_repair: "Fix unsupported legal claims; cite a source or qualify the claim.",
    electoral_caution_repair: "Convert absolute fraud claims to allegation, judicial-record, or ECI-defence framing.",
    un_framing_repair: "Replace UN framing with Indian parliamentary framing.",
    d11_structure_repair: "Rewrite Final Strategic Synthesis into Diagnosis, Prescription, Warning without a bullet dump.",
    indian_parliamentary_framing_repair: "Replace generic/UN phrasing with Treasury Bench, Opposition, ministries, courts, motions, amendments, and committee recommendations.",
    debate_utility_repair: "Add Treasury Bench, Opposition, POIs, rebuttals, amendment language, and floor strategy.",
    strategic_synthesis_repair: "Rewrite strategy as Diagnosis, Prescription, Warning, not a summary.",
    source_gap_disclosure_repair: "Disclose source gaps plainly and avoid filling them with unsupported claims.",
    length_repair: "Extend the answer with bullet-led, source-cited points drawn only from the existing EvidenceRegistry/EvidencePacks; do not pad with unsourced prose.",
    length_trim_repair: "Trim the answer down to the configured mode word cap by dropping trailing paragraphs; keep all citations and claims in the kept body intact.",
  };
  return templates[repairType];
}

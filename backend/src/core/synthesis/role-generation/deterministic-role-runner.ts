import type { EvidenceCard } from "../../evidence/evidence-pack-builder.js";
import type { SourceUsageMapItem } from "../../evidence/source-usage-map.js";

export function buildDeterministicRoleUsageItems(
  cards: EvidenceCard[],
  minimum: number,
  roleName = "evidence_extractor",
): SourceUsageMapItem[] {
  const required = Math.max(minimum, 0);
  // Over-select enough of the assigned pool that rotated roles can union to the mode floor
  // when many citation-eligible sources are snippet/limited rather than full-text.
  const target = required === 0
    ? 0
    : Math.min(cards.length, Math.max(required + 8, Math.ceil(required * 1.5), Math.ceil(cards.length * 0.5)));
  return selectDeterministicCards(cards, target).map((card) => usageItemFromCard(card, roleName));
}

function selectDeterministicCards(cards: EvidenceCard[], minimum: number): EvidenceCard[] {
  if (minimum <= 0) return [];
  const countable = cards.filter((card) => !isWeakCard(card) && hasCountableFinding(card));
  const weakOrContextual = cards.filter((card) => !countable.includes(card));
  return [...preferSourceClassDiversity(countable), ...weakOrContextual].slice(0, minimum);
}

function preferSourceClassDiversity(cards: EvidenceCard[]): EvidenceCard[] {
  const picked = new Set<number>();
  const diverseFirst: EvidenceCard[] = [];
  const seenClasses = new Set<string>();
  for (const card of cards) {
    if (seenClasses.has(card.sourceClass)) continue;
    seenClasses.add(card.sourceClass);
    picked.add(card.sourceId);
    diverseFirst.push(card);
  }
  return [...diverseFirst, ...cards.filter((card) => !picked.has(card.sourceId))];
}

function usageItemFromCard(card: EvidenceCard, roleName: string): SourceUsageMapItem {
  const confidence = confidenceForCard(card);
  const weak = isWeakCard(card);
  const number = firstMeaningful(card.keyNumbers ?? []);
  const substantiveNumber = number && isSubstantiveNumber(number) ? number : undefined;
  const legalHolding = firstMeaningful(card.legalHoldings ?? []);
  const fact = firstMeaningful(evidenceTexts(card));
  const numberClaim = substantiveNumber ? factContaining(card, substantiveNumber) ?? fact : fact;
  const limitation = (card.limitations ?? [])[0] ?? qualityLimitation(card);
  if (weak || (!fact && !substantiveNumber && !legalHolding)) {
    return baseCardItem(card, {
      usageType: "relevant_but_weak",
      limitation,
      confidence: "low",
    });
  }
  // Role-faithful deterministic types (must match role-specific instructions).
  if (/retrieval_critic|final_quality/i.test(roleName)) {
    return baseCardItem(card, {
      usageType: "used_for_reliability_matrix",
      extractedClaim: fact,
      limitation: limitation ?? "Deterministic source-reliability assessment.",
      supportedSection: "source_gap_report",
      confidence,
    });
  }
  if (/citation_auditor/i.test(roleName)) {
    return baseCardItem(card, {
      usageType: "used_for_citation_audit",
      extractedClaim: fact,
      limitation: limitation ?? "Deterministic citation-safety audit.",
      supportedSection: "evidence_verification",
      confidence,
    });
  }
  if (/thesis/i.test(roleName) && fact) {
    return baseCardItem(card, {
      usageType: "supports_claim",
      extractedClaim: fact,
      supportedSection: "strategic_insights",
      limitation: card.limitations[0],
      confidence,
    });
  }
  if (/data|stat/i.test(roleName)) {
    const percentFromFact = fact?.match(/\b\d+(?:\.\d+)?%/);
    const num = substantiveNumber ?? percentFromFact?.[0];
    if (num) {
      return baseCardItem(card, {
        usageType: "number_extracted",
        extractedNumber: num,
        extractedClaim: (substantiveNumber ? numberClaim : fact) ?? num,
        supportedSection: "data_statistics",
        limitation: card.limitations[0],
        confidence,
      });
    }
    if (fact) {
      return baseCardItem(card, {
        usageType: "fact_extracted",
        extractedClaim: fact,
        supportedSection: "data_statistics",
        limitation: card.limitations[0],
        confidence,
      });
    }
    return baseCardItem(card, {
      usageType: "relevant_but_weak",
      limitation: limitation ?? "No substantive statistic available for data_analyst.",
      confidence: "low",
    });
  }
  if (/legal/i.test(roleName) && legalHolding && ["court_primary", "legal_commentary"].includes(card.sourceClass)) {
    return baseCardItem(card, {
      usageType: "legal_holding_extracted",
      legalHolding,
      limitation: card.limitations[0],
      supportedSection: "legal_analysis",
      confidence,
    });
  }
  if (/parliamentary|strategist/i.test(roleName) && fact) {
    return baseCardItem(card, {
      usageType: "used_for_debate_utility",
      extractedClaim: fact,
      supportedSection: "debate_utility",
      limitation: card.limitations[0],
      confidence,
    });
  }
  if (substantiveNumber) {
    return baseCardItem(card, {
      usageType: "number_extracted",
      extractedNumber: substantiveNumber,
      extractedClaim: numberClaim,
      supportedSection: numberClaim ? undefined : "data_statistics",
      limitation: card.limitations[0],
      confidence,
    });
  }
  if (legalHolding && ["court_primary", "legal_commentary"].includes(card.sourceClass)) {
    return baseCardItem(card, {
      usageType: "legal_holding_extracted",
      legalHolding,
      supportedSection: "legal_analysis",
      limitation: card.limitations[0],
      confidence,
    });
  }
  return baseCardItem(card, {
    usageType: "fact_extracted",
    extractedClaim: fact,
    supportedSection: "evidence_verification",
    limitation: card.limitations[0],
    confidence,
  });
}

function isWeakCard(card: EvidenceCard): boolean {
  const citationStrength = card.citationStrength ?? "medium";
  const extractionQuality = card.extractionQuality ?? "partial";
  const hasSubstantiveEvidence = [
    ...(card.keyFacts ?? []),
    ...(card.keyNumbers ?? []),
    ...(card.legalHoldings ?? []),
    ...(card.topChunks ?? []).map((chunk) => chunk.text),
    card.contentPreview,
    card.debateUse,
  ].some((value) => {
    const text = typeof value === "string" ? value.trim() : "";
    // Require enough real text so snippet/Exa fallbacks can count without inventing claims.
    return text.length >= 40 && !/^title-only relevance:/i.test(text) && !isBadEvidenceText(text);
  });
  return citationStrength === "ineligible"
    || extractionQuality === "failed"
    || !hasSubstantiveEvidence
    || (card.keyFacts ?? []).length > 0 && (card.keyFacts ?? []).every((fact) => /^title-only relevance:/i.test(fact.trim()) || isBadEvidenceText(fact));
}

function hasCountableFinding(card: EvidenceCard): boolean {
  return [...evidenceTexts(card), ...(card.keyNumbers ?? []), ...(card.legalHoldings ?? [])].some((value) => {
    const text = value?.trim();
    return Boolean(text) && !/^title-only relevance:/i.test(text!) && !isBadEvidenceText(text!);
  });
}

function confidenceForCard(card: EvidenceCard): SourceUsageMapItem["confidence"] {
  const citationStrength = card.citationStrength ?? "medium";
  const extractionQuality = card.extractionQuality ?? "partial";
  if (citationStrength === "strong" && extractionQuality === "full" && !card.limitedSource) return "high";
  if ((citationStrength === "strong" || citationStrength === "medium") && (extractionQuality === "full" || extractionQuality === "partial") && !card.limitedSource) return "medium";
  return "low";
}

function baseCardItem(card: EvidenceCard, fields: Pick<SourceUsageMapItem, "usageType" | "confidence"> & Partial<SourceUsageMapItem>): SourceUsageMapItem {
  return {
    sourceId: card.sourceId,
    title: card.title,
    bucketIds: card.bucketIds ?? [],
    sourceClass: card.sourceClass,
    method: "deterministic_extraction",
    citationStrength: card.citationStrength ?? "medium",
    limitedSource: card.limitedSource === true,
    ...fields,
  };
}

function firstMeaningful(values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    const text = value?.trim();
    if (!text) continue;
    if (/^title-only relevance:/i.test(text)) continue;
    if (isBadEvidenceText(text)) continue;
    const sentence = text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? text;
    if (isBadEvidenceText(sentence)) continue;
    if (sentence.length >= 4) return sentence.length > 240 ? `${sentence.slice(0, 237).trimEnd()}...` : sentence;
  }
  return undefined;
}

function isBadEvidenceText(text: string): boolean {
  if (/you need to enable javascript to run this app/i.test(text)) return true;
  if (/endstream endobj|xref\s+\d+|%ï¿½|ï¿½{2,}/i.test(text)) return true;
  if (/LOK SABHA|RAJYA SABHA|UNSTARRED QUESTION|STARRED QUESTION|Will the Minister of|TO BE ANSWERED ON/i.test(text)) return true;
  if (/IN THE SUPREME COURT OF INDIA|WRIT PETITION|CIVIL (?:APPELLATE|ORIGINAL) JURISDICTION|REPORTABLE|NON-REPORTABLE/i.test(text)) return true;
  if (/External link confirmation|img Essay Series|\bA2A\b|json LICENSE|Browse by Topics|STATES CITIES SPORTS/i.test(text)) return true;
  if (/GOVERNMENT OF INDIA MINISTRY OF/i.test(text) && text.length > 80) return true;
  const replacementCount = (text.match(/ï¿½/g) ?? []).length;
  return replacementCount >= 3 || replacementCount / Math.max(1, text.length) > 0.02;
}

function evidenceTexts(card: EvidenceCard): Array<string | null | undefined> {
  return [
    card.contentPreview,
    ...(card.keyFacts ?? []),
    ...(card.topChunks ?? []).map((chunk) => chunk.text),
    card.debateUse,
  ];
}

function factContaining(card: EvidenceCard, value: string): string | undefined {
  const target = value.trim();
  if (!target) return undefined;
  return firstMeaningful(evidenceTexts(card).filter((text) => text?.includes(target)));
}

function isSubstantiveNumber(value: string): boolean {
  return /%|,|\.\d/.test(value.trim());
}

function qualityLimitation(card: EvidenceCard): string {
  if (card.extractionQuality === "failed") return "Extraction failed; do not count as proof.";
  if (card.extractionQuality === "snippet") return "Snippet-only source; use as context unless corroborated.";
  if (card.limitedSource) return "Limited source; use cautiously and qualify.";
  if (card.citationStrength === "weak" || card.citationStrength === "ineligible") return "Weak citation strength; use as contextual material.";
  const fact = firstMeaningful(evidenceTexts(card));
  if (!fact || fact.length < 40 || isBadEvidenceText(fact)) return "Only weak or title-level background text was available.";
  return "Extracted text is usable; do not extend claims past the card.";
}

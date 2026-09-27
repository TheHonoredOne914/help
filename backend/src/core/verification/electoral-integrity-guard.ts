import type { ClaimGraph } from "../evidence/claim-graph.js";

const UNSAFE_ELECTORAL_PATTERNS = [
  /\belection(?:s)?\s+was\s+rigged\b/i,
  /\belection(?:s)?\s+were\s+rigged\b/i,
  /\bEVMs?\s+were\s+compromised\b/i,
  /\belectoral\s+fraud\s+is\s+established\b/i,
  /\bcounting\s+was\s+manipulated\b/i,
  /\bEVMs?\s+cannot\s+be\s+trusted\b/i,
  /\bresults\s+were\s+stolen\b/i,
  /\belection\s+was\s+stolen\b/i,
  /\bfraud happened\b/i,
  /(?<!allegations of )\bEVMs?\s+were\s+(?:manipulated|hacked|rigged)\b/i,
];

export interface ElectoralIntegrityValidationOptions {
  originalUserQuery?: string;
  claimGraph?: ClaimGraph | null;
}

export function validateElectoralIntegrityLanguage(
  text: string,
  options: ElectoralIntegrityValidationOptions = {},
) {
  const issues: string[] = [];
  for (const pattern of UNSAFE_ELECTORAL_PATTERNS) {
    const match = text.match(pattern);
    if (match) issues.push(`electoral_integrity: unsupported electoral fraud proof language (${match[0]})`);
  }
  if ((options.claimGraph?.claims ?? []).some((claim) => claim.type === "allegation" && /fraud|rigged|stolen|evm/i.test(claim.text) && claim.forbiddenIfUnsupported)) {
    issues.push("electoral_integrity: ClaimGraph marks electoral allegation as unsupported");
  }
  const electoralTopic = /\belection|electoral|evm|vvpat|eci|election commission\b/i.test(options.originalUserQuery ?? text);
  const discussesElection = /\belection|electoral|evm|vvpat|eci|election commission\b/i.test(text);
  const cautious = /\balleg(?:e|ation)|petition|eci (?:responded|defence|defense)|court held|evidence threshold|not proven|requires proof\b/i.test(text);
  if (electoralTopic && !discussesElection) {
    return {
      passed: true,
      issues: ["electoral_integrity: electoral topic lacks electoral caution discussion"],
      categoryScore: 3,
      repairedText: text,
    };
  }
  return {
    passed: issues.length === 0,
    issues,
    categoryScore: issues.length ? 0 : cautious ? 10 : electoralTopic ? 6 : 8,
    repairedText: text.replace(/fraud happened|election was stolen|EVMs were manipulated/gi, "electoral allegations require proof"),
  };
}

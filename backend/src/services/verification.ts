import type { EnrichedResult, SearchResult } from "../lib/types.js";
import { verifyAnswer, type VerifyOptions } from "../lib/verify.js";

export interface VerificationGate {
  passed: boolean;
  confidence: number;
  flaggedClaims: string[];
  suggestedCorrections: string[];
}

export class VerificationService {
  async verifyInline(claim: string, sources: SearchResult[] | EnrichedResult[], opts: VerifyOptions = {}): Promise<VerificationGate> {
    const result = await verifyAnswer(claim, sources, claim, opts);
    const confidence = result.confidence <= 1 ? Math.round(result.confidence * 100) : Math.round(result.confidence);
    return {
      passed: result.verified || confidence >= 65,
      confidence,
      flaggedClaims: extractFlaggedClaims(result.notes),
      suggestedCorrections: [],
    };
  }

  async verifyAnswer(query: string, sources: SearchResult[] | EnrichedResult[], answer: string, opts: VerifyOptions = {}) {
    return verifyAnswer(query, sources, answer, opts);
  }
}

export async function verifyBeforeStream(
  synthesis: string,
  query: string,
  sources: SearchResult[] | EnrichedResult[],
  opts: VerifyOptions = {}
): Promise<VerificationGate> {
  const service = new VerificationService();
  return service.verifyInline(`${query}\n\n${synthesis}`, sources, opts);
}

function extractFlaggedClaims(notes: string): string[] {
  return notes
    .split(/(?:\n|;|\.)/)
    .map((line) => line.trim())
    .filter((line) => /\b(unsupported|unverified|fabricated|contradict|not found|no source|uncited)\b/i.test(line))
    .slice(0, 8);
}

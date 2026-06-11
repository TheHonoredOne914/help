import type { GateResult, QualityGateRuntimeInput } from "./types.js";

export function runCitationQualityGate({ finalText, registry }: QualityGateRuntimeInput): GateResult {
  const issues = [];
  let score = 15;
  const linked = [...finalText.matchAll(/\[Source\s+(\d+)\]\((https?:\/\/[^)]+)\)/gi)];
  if (linked.length === 0) {
    issues.push({ code: "zero_valid_citations", message: "zero valid citations", severity: "fatal" as const });
    score = 0;
  }
  if (/\[Source\s+\d+\](?!\()/i.test(finalText) || /\[Source\s+\d+\]\((?!https?:\/\/)/i.test(finalText)) {
    issues.push({ code: "fake_citations", message: "fake citations", severity: "fatal" as const });
    score = 0;
  }
  for (const match of linked) {
    const source = registry.getSource(Number(match[1]));
    if (!source || !sameCitationUrl(source.url, match[2])) {
      issues.push({ code: "fake_citations", message: "fake citations", severity: "fatal" as const });
      score = 0;
      break;
    }
  }
  return {
    score,
    maxScore: 15,
    issues,
    metrics: { linkedCitationCount: linked.length },
    categoryScores: { citationValidity: score },
  };
}

function sameCitationUrl(a: string, b: string): boolean {
  try {
    return canonicalCitationUrl(a) === canonicalCitationUrl(b);
  } catch {
    return false;
  }
}

function canonicalCitationUrl(value: string): string {
  const parsed = new URL(value);
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^utm_|fbclid|gclid|mc_cid/i.test(key)) parsed.searchParams.delete(key);
  }
  parsed.hostname = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "").replace(/^amp\./, "").toLowerCase();
  return parsed.toString().replace(/%28/gi, "(").replace(/%29/gi, ")").replace(/\/$/, "");
}

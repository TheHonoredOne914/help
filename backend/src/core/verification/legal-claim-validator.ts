import type { EvidenceRegistryCore } from "../evidence/evidence-registry.js";

export const KNOWN_VALID_ARTICLES = new Set([
  // Part III — Fundamental Rights
  "12", "13", "14", "15", "16", "17", "19", "20", "21", "21A", "22", "23", "24", "25", "26",
  // Part III continued + writs
  "30", "31", "32",
  // Part IV — Directive Principles
  "38", "39", "39A", "44",
  // Part IV-A — Fundamental Duties
  "51A",
  // Part V — Union Executive & Legislature
  "51", "73", "110",
  // Part V — Supreme Court
  "123", "124", "136", "142", "143", "144",
  // Part VI — State Executive & Legislature
  "200", "213", "226", "227",
  // Part IX — Panchayats & Municipalities
  "243D", "243G",
  // Part XI — Centre-State Relations
  "246", "254",
  // Part XII — Finance
  "280", "300A",
  // Part XIV — Services
  "311", "312", "315",
  // Part XVIII — Emergency Provisions
  "352", "356", "360",
  // Part XXI — Temporary & Special Provisions
  "368", "370", "371", "371A",
]);

const KNOWN_SC_CASES = [
  "Romesh Thappar v State of Madras",
  "Kedar Nath Singh v State of Bihar",
  "Maneka Gandhi v Union of India",
  "Shreya Singhal v Union of India",
  "Anuradha Bhasin v Union of India",
  "S G Vombatkere v Union of India",
  "ADM Jabalpur v Shivkant Shukla",
  "Navtej Singh Johar v Union of India",
];

export function validateLegalClaims(text: string, registry: EvidenceRegistryCore) {
  const hasCourtSource = registry.getSourcesByClass("court_primary").length > 0 || registry.getSourcesByClass("legal_commentary").length > 0;
  const legalLanguage = /Supreme Court|judgment|holding|held|Article\s+\d+/i.test(text);
  const registryText = registry.sources.map((source) => `${source.title} ${source.snippet ?? ""} ${source.fullText ?? ""} ${source.legalHoldings.join(" ")}`).join("\n");
  const warnings: string[] = [];
  const criticalIssues: string[] = [];
  if (legalLanguage && !hasCourtSource) criticalIssues.push("Legal claim requires court/legal source.");
  for (const article of extractArticleMentions(text)) {
    if (!KNOWN_VALID_ARTICLES.has(article)) criticalIssues.push(`Unknown constitutional Article ${article}.`);
  }
  for (const caseName of extractCaseMentions(text)) {
    const known = KNOWN_SC_CASES.some((knownCase) => normalize(knownCase) === normalize(caseName));
    const grounded = normalize(registryText).includes(normalize(caseName));
    if (!known && !grounded) warnings.push(`Unrecognized case claim needs source or qualification: ${caseName}.`);
  }
  const issues = [...criticalIssues, ...warnings];
  return {
    passed: issues.length === 0,
    issues,
    warnings,
    criticalIssues,
    repairHints: issues.map((item) => item.startsWith("Unrecognized case")
      ? "Qualify the case name or cite a registry source where the case appears."
      : "Remove or correct the unsupported legal claim."),
  };
}

export function extractArticleMentions(text: string): string[] {
  return [...new Set([...text.matchAll(/\bArticle\s+(\d+[A-Z]?)(?:\(\d+\))?(?:\([a-z]\))?/gi)].map((match) => match[1].toUpperCase()))];
}

export function extractCaseMentions(text: string): string[] {
  return [...new Set([...text.matchAll(/\b([A-Z][A-Za-z. ]+\s+v\.?\s+(?:State of|Union of|Election Commission|[A-Z][A-Za-z. ]+))/g)].map((match) => match[1].trim()))];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

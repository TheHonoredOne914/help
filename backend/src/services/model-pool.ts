import { getGroqClient } from "../lib/groq-client.js";
import { getOpenRouterClient } from "../lib/openrouter-client.js";
import type { SearchResult } from "../lib/types.js";
import { mergeSearchResults } from "./batch-executor.js";

export interface ModelPoolEntry {
  client: any;
  modelId: string;
}

export function buildModelPool(
  modelInfos: Array<{ rawModelId: string; modelId: string; client: any; providerLabel: string }>,
  groqKey: string | null | undefined,
  _geminiKey: string | null | undefined,
  openrouterKey: string | null | undefined,
): ModelPoolEntry[] {
  const pool: ModelPoolEntry[] = [];

  if (openrouterKey?.trim()) {
    const orClient = getOpenRouterClient(openrouterKey);
    pool.push({ client: orClient, modelId: "anthropic/claude-opus-4-5-20250514" });
  }

  for (const info of modelInfos) {
    pool.push({ client: info.client, modelId: info.modelId });
  }

  if (groqKey?.trim() && pool.length < 2) {
    pool.push({ client: getGroqClient(groqKey), modelId: "llama-3.3-70b-versatile" });
  }

  return pool;
}

export function ensureResearchWorkerModels(
  mode: string,
  models: string[],
  fallbackModel = "groq/llama-3.3-70b-versatile",
): string[] {
  if (mode !== "web_search" && mode !== "deep_research") return models;
  if (models.length >= 2) return models;

  const planner = models[0] ?? fallbackModel;
  const fallbackWorker = planner !== fallbackModel
    ? fallbackModel
    : "groq/llama-3.1-8b-instant";

  return [planner, fallbackWorker];
}

export function buildSparseEvidenceWarning(results: SearchResult[], userQuery: string): string {
  const merged = mergeSearchResults(results).slice(0, 6);
  const sources = merged.length > 0
    ? merged.map((r, i) => `${i + 1}. ${r.title} — ${r.url}`).join("\n")
    : "No strong official or legal sources were retrieved.";
  return [
    "## Evidence Limitations",
    `Research on "${userQuery.slice(0, 160)}" returned sparse or uneven evidence.`,
    "The answer below should be treated as a partial brief, not a definitive MUN note.",
    "",
    "Best sources found so far:",
    sources,
  ].join("\n");
}

export function researchQualityScore(results: SearchResult[]): number {
  const unique = mergeSearchResults(results);
  if (unique.length === 0) return 0;
  const gov = unique.filter((r) => r.sourceType === "government_india" && r.score >= 9).length;
  const court = unique.filter((r) => r.sourceType === "court_judgement").length;
  const intl = unique.filter((r) => r.sourceType === "government_international" || r.sourceType === "international_research").length;
  const reports = unique.filter((r) => Boolean(r.reportType)).length;
  return unique.length + gov * 2 + court * 1.5 + intl + reports * 0.5;
}

export function shouldRunCrossModelDiscussion(results: SearchResult[], isDeep: boolean, forceSkip = false): boolean {
  if (forceSkip) return false;
  const unique = mergeSearchResults(results);
  const gov = unique.filter((r) => r.sourceType === "government_india" && r.score >= 9).length;
  const court = unique.filter((r) => r.sourceType === "court_judgement").length;
  const total = unique.length;
  const quality = researchQualityScore(unique);

  if (isDeep) {
    return total >= 6 || gov >= 2 || court >= 1 || quality >= 10;
  }
  return total >= 4 || gov >= 2 || court >= 1 || quality >= 7;
}

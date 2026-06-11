import type { EvidenceCard } from "../../evidence/evidence-pack-builder.js";
import { normalizeSourceUsageItems, type SourceUsageMapItem } from "../../evidence/source-usage-map.js";

export function parseRoleOutputItems(jsonOrText: unknown, batch: EvidenceCard[]): SourceUsageMapItem[] {
  let json: unknown;
  if (typeof jsonOrText === "string") {
    const extracted = extractJson(jsonOrText);
    try {
      json = JSON.parse(extracted);
    } catch {
      throw new Error(`Failed to parse role output JSON: ${jsonOrText.slice(0, 200)}${jsonOrText.length > 200 ? "..." : ""}`);
    }
  } else {
    json = jsonOrText;
  }
  return normalizeSourceUsageItems(json, batch);
}

export function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) return fenced;
  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) return trimmed.slice(objectStart, objectEnd + 1);
  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) return trimmed.slice(arrayStart, arrayEnd + 1);
  return trimmed;
}

import type { EvidenceSourceInput } from "./evidence-registry-types.js";

export interface RegistryIntegrityResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
}

export function validateBeforeStorage(source: EvidenceSourceInput): RegistryIntegrityResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!source.url?.trim()) errors.push("Missing URL");
  if (!source.title?.trim()) errors.push("Missing title");
  if (!source.canonicalUrl?.trim()) errors.push("Missing canonicalUrl");
  if (source.citationEligible && source.extractionQuality === "failed") warnings.push("citationEligible=true but extractionQuality=failed; demoting");
  if (source.extractionQuality === "snippet" && !source.limitedSource) warnings.push("snippet source missing limitedSource=true");
  if ((source.topChunks?.length ?? 0) > 0 && !source.fullText?.trim()) warnings.push("topChunks present but no fullText; chunks may be orphaned");
  return { ok: errors.length === 0, warnings, errors };
}

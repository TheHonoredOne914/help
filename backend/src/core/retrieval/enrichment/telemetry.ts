import { telemetry } from "../../../lib/telemetry.js";

export type EnrichmentTelemetryEvent =
  | "enrichment.extraction_method"
  | "enrichment.quality"
  | "enrichment.cache_policy"
  | "enrichment.backup_substituted"
  | "enrichment.card_validation_failed"
  | "enrichment.cerebras_used"
  | "enrichment.cerebras_fallback"
  | "enrichment.failed_not_cached";

export function emitEnrichmentEvent(event: EnrichmentTelemetryEvent, tags: Record<string, string | number | boolean | undefined> = {}): void {
  const safeTags = Object.fromEntries(
    Object.entries(tags)
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
      .map(([key, value]) => [key, typeof value === "boolean" ? String(value) : value]),
  ) as Record<string, string | number>;
  telemetry.increment(event, safeTags);
}

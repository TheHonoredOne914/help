import type { CitationInjectionTelemetry } from "./types.js";

/**
 * Creates a telemetry snapshot for a citation injection run.
 * This is used for monitoring, not for control flow.
 */
export function createInjectionTelemetry(
  sectionsProcessed: number,
  divisionsProcessed: number,
  claimsMatched: number,
  fallbackSections: number,
  counterclaimsCited: number,
  totalSourcesUsed: number,
): CitationInjectionTelemetry {
  return {
    totalSectionsProcessed: sectionsProcessed,
    totalDivisionsProcessed: divisionsProcessed,
    totalClaimsMatched: claimsMatched,
    fallbackSectionsCount: fallbackSections,
    counterclaimsCited,
    averageSourcesPerSection: sectionsProcessed > 0 ? totalSourcesUsed / sectionsProcessed : 0,
  };
}

/**
 * Formats telemetry for logging without exposing any secrets.
 */
export function formatInjectionTelemetry(telemetry: CitationInjectionTelemetry): string {
  return [
    `sections=${telemetry.totalSectionsProcessed}`,
    `divisions=${telemetry.totalDivisionsProcessed}`,
    `claims=${telemetry.totalClaimsMatched}`,
    `fallbacks=${telemetry.fallbackSectionsCount}`,
    `counterclaims=${telemetry.counterclaimsCited}`,
    `avg_sources=${telemetry.averageSourcesPerSection.toFixed(1)}`,
  ].join("; ");
}

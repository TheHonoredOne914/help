import { telemetry } from "../../../lib/telemetry.js";

export function emitSourceUsageValidatorEvent(event: string, tags: Record<string, string | number | boolean | undefined> = {}): void {
  const safeTags: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (value === undefined) continue;
    safeTags[key] = typeof value === "boolean" ? Number(value) : value;
  }
  telemetry.increment(`source_usage.${event}`, safeTags);
}

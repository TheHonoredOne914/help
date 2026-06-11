export function legacyFallbackReason(compatibilityMode: boolean): string {
  return compatibilityMode ? "emergency_compatibility_mode" : "core_generation_unavailable";
}

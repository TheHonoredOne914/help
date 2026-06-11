import type { CorePipelineEventSummary } from "@/hooks/use-pipeline-state";

interface ProviderRuntimePanelProps {
  events?: CorePipelineEventSummary[];
  selectedModels?: string[];
  legacyFallbackUsed?: boolean;
}

export function ProviderRuntimePanel({ events = [], selectedModels = [], legacyFallbackUsed = false }: ProviderRuntimePanelProps) {
  const runtime = collectProviderRuntime(events);
  const effectiveModels = runtime.effectiveModels.length > 0 ? runtime.effectiveModels : selectedModels;
  // Only show models - hide all internal provider/runtime details per user requirements
  if (effectiveModels.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/40 bg-background/70 p-2.5">
      <p className="text-[10px] font-semibold text-muted-foreground">Model Progress</p>
      {effectiveModels.length > 0 && (
        <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground break-all">
          Models: {effectiveModels.join(", ")}
        </p>
      )}
    </div>
  );
}

function collectProviderRuntime(events: CorePipelineEventSummary[]) {
  const effectiveModels = new Set<string>();
  const warnings = new Set<string>();
  const errors = new Set<string>();
  const fallbacks = new Set<string>();
  const cooldowns = new Set<string>();
  const searchProviders = new Set<string>();
  const extractionProviders = new Set<string>();
  let fallbackExtractionCount = 0;

  for (const event of events) {
    const data = event.data ?? {};
    collectStrings(data.effectiveModels).forEach((value) => effectiveModels.add(value));
    collectStrings(data.providerWarnings).forEach((value) => warnings.add(redactSecretLike(value)));
    collectStrings(data.warnings).forEach((value) => warnings.add(redactSecretLike(value)));
    collectStrings(data.providerErrors).forEach((value) => errors.add(redactSecretLike(value)));
    collectStrings(data.searchProvidersUsed).forEach((value) => searchProviders.add(value));
    collectStrings(data.extractionProvidersUsed).forEach((value) => extractionProviders.add(value));
    collectStrings(data.errors).forEach((value) => errors.add(redactSecretLike(value)));
    collectStrings(data.fallbacks).forEach((value) => fallbacks.add(redactSecretLike(value)));
    collectStrings(data.cooldowns).forEach((value) => cooldowns.add(redactSecretLike(value)));

    // Fix (Bug: L85): truncate very long provider strings for layout safety
    if (typeof data.fallbackProvider === "string") {
      const label = data.fallbackProvider.length > 60
        ? `${data.fallbackProvider.slice(0, 60)}…`
        : data.fallbackProvider;
      fallbacks.add(`provider ${label}`);
    }
    if (typeof data.rateLimitResetMs === "number") cooldowns.add(`${Math.round(data.rateLimitResetMs / 1000)}s`);
    if (typeof data.fallbackExtractionCount === "number") fallbackExtractionCount += data.fallbackExtractionCount;
  }

  return {
    effectiveModels: [...effectiveModels],
    warnings: [...warnings],
    errors: [...errors],
    fallbacks: [...fallbacks],
    cooldowns: [...cooldowns],
    searchProviders: [...searchProviders],
    extractionProviders: [...extractionProviders],
    fallbackExtractionCount,
  };
}

function collectStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "string") return [item];
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const provider = typeof record.provider === "string" ? record.provider : "provider";
        const message = typeof record.message === "string" ? record.message : typeof record.error === "string" ? record.error : "";
        return message ? [`${provider} ${message}`] : [];
      }
      return [];
    });
  }
  return typeof value === "string" ? [value] : [];
}

// Fix (Bug: L115): raise threshold to 40 chars so model IDs like
// "openrouter/meta-llama/llama-3-8b-instruct:free" are NOT redacted
function redactSecretLike(value: string): string {
  return value.replace(/[A-Za-z0-9]{40,}/g, "[redacted]");
}

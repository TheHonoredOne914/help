export interface ResearchTelemetryCounter {
  cacheHits: number;
  cacheMisses: number;
  modelCalls: number;
  providerErrors: string[];
}

export class ResearchTelemetry {
  private counters: ResearchTelemetryCounter = { cacheHits: 0, cacheMisses: 0, modelCalls: 0, providerErrors: [] };

  hit(): void { this.counters.cacheHits += 1; }
  miss(): void { this.counters.cacheMisses += 1; }
  modelCall(): void { this.counters.modelCalls += 1; }
  providerError(error: string): void { this.counters.providerErrors.push(error); }

  snapshot(): ResearchTelemetryCounter {
    return { ...this.counters, providerErrors: [...this.counters.providerErrors] };
  }
}

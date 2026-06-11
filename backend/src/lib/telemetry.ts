import type { TopicType } from "./rag.js";
import { logger } from "./logger.js";

type TelemetrySnapshot = {
  counters: Record<string, { value: number; tags: Record<string, string | number> }>;
  gauges: Record<string, { value: number; tags: Record<string, string | number> }>;
  histograms: Record<string, { count: number; min: number; max: number; avg: number; tags: Record<string, string | number> }>;
};

const counters = new Map<string, { value: number; tags: Record<string, string | number> }>();
const gauges = new Map<string, { value: number; tags: Record<string, string | number> }>();
const histograms = new Map<string, { values: number[]; tags: Record<string, string | number> }>();

function metricKey(metric: string, tags: Record<string, string | number>): string {
  const tagKey = Object.entries(tags).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join(",");
  return tagKey ? `${metric}{${tagKey}}` : metric;
}

export const telemetry = {
  increment(metric: string, tags: Record<string, string | number> = {}): void {
    this.counter(metric, 1, tags);
    logger.debug({ metric, tags }, "[telemetry] increment");
  },
  counter(metric: string, value = 1, tags: Record<string, string | number> = {}): void {
    const key = metricKey(metric, tags);
    const current = counters.get(key) ?? { value: 0, tags };
    current.value += value;
    counters.set(key, current);
    logger.debug({ metric, value, tags }, "[telemetry] counter");
  },
  histogram(metric: string, value: number, tags: Record<string, string | number> = {}): void {
    const key = metricKey(metric, tags);
    const current = histograms.get(key) ?? { values: [], tags };
    current.values.push(value);
    histograms.set(key, current);
    logger.debug({ metric, value, tags }, "[telemetry] histogram");
  },
  gauge(metric: string, value: number, tags: Record<string, string | number> = {}): void {
    const key = metricKey(metric, tags);
    gauges.set(key, { value, tags });
    logger.debug({ metric, value, tags }, "[telemetry] gauge");
  },
  getCount(metric: string, tags: Record<string, string | number> = {}): number {
    const direct = counters.get(metricKey(metric, tags));
    if (direct) return direct.value;
    let total = 0;
    for (const [key, value] of counters) {
      if (key === metric || key.startsWith(`${metric}{`)) total += value.value;
    }
    return total;
  },
  snapshot(): TelemetrySnapshot {
    const histogramSnapshot: TelemetrySnapshot["histograms"] = {};
    for (const [key, { values, tags }] of histograms) {
      const sum = values.reduce((total, item) => total + item, 0);
      histogramSnapshot[key] = {
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.length > 0 ? sum / values.length : 0,
        tags,
      };
    }
    return {
      counters: Object.fromEntries(counters),
      gauges: Object.fromEntries(gauges),
      histograms: histogramSnapshot,
    };
  },
  reset(): void {
    counters.clear();
    gauges.clear();
    histograms.clear();
  },
};

if (typeof process !== "undefined") {
  setInterval(() => {
    const snapshot = telemetry.snapshot();
    if (Object.keys(snapshot.counters).length > 0 || Object.keys(snapshot.gauges).length > 0 || Object.keys(snapshot.histograms).length > 0) {
      logger.info({ telemetry: snapshot }, "[telemetry] 60s flush");
      telemetry.reset();
    }
  }, 60_000).unref();
}

export interface ResearchTelemetry {
  requestId: string;
  mode: string;
  topic: TopicType;
  agendaClass: string;
  modelsUsed: string[];
  searchQueriesTotal: number;
  resultsRetrieved: number;
  govInSourceCount: number;
  courtJudgmentCount: number;
  synthesisModel: string;
  synthesisTokens: number;
  citationCount: number;
  citationCoveragePct: number;
  verificationPassed: boolean;
  verificationConfidence: number;
  qualityScore: number;
  latencyMs: {
    planning: number;
    retrieval: number;
    synthesis: number;
    verification: number;
    total: number;
  };
  errors: string[];
}

export interface TelemetryCollector {
  mark(stage: keyof ResearchTelemetry["latencyMs"]): void;
  patch(update: Partial<ResearchTelemetry>): void;
  addError(error: unknown): void;
  flush(): ResearchTelemetry;
}

export function createTelemetryCollector(requestId: string): TelemetryCollector {
  const started = Date.now();
  const marks = new Map<string, number>();
  const telemetry: ResearchTelemetry = {
    requestId,
    mode: "normal",
    topic: "governance_policy",
    agendaClass: "unknown",
    modelsUsed: [],
    searchQueriesTotal: 0,
    resultsRetrieved: 0,
    govInSourceCount: 0,
    courtJudgmentCount: 0,
    synthesisModel: "",
    synthesisTokens: 0,
    citationCount: 0,
    citationCoveragePct: 0,
    verificationPassed: false,
    verificationConfidence: 0,
    qualityScore: 0,
    latencyMs: { planning: 0, retrieval: 0, synthesis: 0, verification: 0, total: 0 },
    errors: [],
  };

  return {
    mark(stage) {
      const now = Date.now();
      marks.set(stage, now);
      if (stage !== "total") telemetry.latencyMs[stage] = now - (marks.get(`${stage}:start`) ?? started);
    },
    patch(update) {
      Object.assign(telemetry, update);
    },
    addError(error) {
      telemetry.errors.push(error instanceof Error ? error.message : String(error));
    },
    flush() {
      telemetry.latencyMs.total = Date.now() - started;
      const level = telemetry.qualityScore < 50 || !telemetry.verificationPassed ? "error" : "info";
      logger[level]({ telemetry }, "[telemetry] research request complete");
      return telemetry;
    },
  };
}

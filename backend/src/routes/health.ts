import { Router, type IRouter } from "express";
import { groqClient, groqEnabled } from "../lib/groq-client.js";
import { ollamaClient, ollamaEnabled } from "../lib/ollama-client.js";
import { nvidiaClient, nvidiaEnabled } from "../lib/nvidia-client.js";
import { extractKeys } from "../lib/provider-router.js";
import { telemetry } from "../lib/telemetry.js";
import { getSearchEngineHealth } from "../lib/web-search.js";

const router: IRouter = Router();

type ProviderKey = "groq" | "ollama" | "nvidia" | "serper" | "brave" | "jina";
type ProviderStatus = "connected" | "error" | "missing";

interface ProviderProbeResult {
  enabled: boolean;
  ok: boolean;
  error?: unknown;
}

interface ProviderDiagnosticsInput {
  uptime: number;
  providers: Partial<Record<ProviderKey, ProviderProbeResult>>;
}

function getErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  return null;
}

function toProviderDiagnostic(result: ProviderProbeResult): { status: ProviderStatus; message?: string } {
  if (!result.enabled) return { status: "missing" };
  if (result.ok) return { status: "connected" };

  const message = getErrorMessage(result.error);
  return message ? { status: "error", message } : { status: "error" };
}

export function buildProviderDiagnostics(input: ProviderDiagnosticsInput) {
  const providerKeys = Object.keys(input.providers) as ProviderKey[];
  const providers = Object.fromEntries(
    providerKeys.map((key) => [key, toProviderDiagnostic(input.providers[key] ?? { enabled: false, ok: false })])
  ) as Record<ProviderKey, { status: ProviderStatus; message?: string }>;

  const overallStatus = Object.values(providers).some((provider) => provider.status === "error")
    ? "degraded"
    : "ok";

  return {
    status: overallStatus,
    uptime: input.uptime,
    ...(providers.groq ? { groq: providers.groq.status } : {}),
    ...(providers.ollama ? { ollama: providers.ollama.status } : {}),
    ...(providers.nvidia ? { nvidia: providers.nvidia.status } : {}),
    ...(providers.serper ? { serper: providers.serper.status } : {}),
    ...(providers.brave ? { brave: providers.brave.status } : {}),
    ...(providers.jina ? { jina: providers.jina.status } : {}),
    providers,
  };
}

async function runProviderProbe(enabled: boolean, probe: () => Promise<boolean>): Promise<ProviderProbeResult> {
  if (!enabled) {
    return { enabled: false, ok: false };
  }

  try {
    return { enabled: true, ok: await probe() };
  } catch (error) {
    return { enabled: true, ok: false, error };
  }
}

async function probeFetch(url: string, init: RequestInit, acceptedStatuses = [200]): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    return acceptedStatuses.includes(resp.status) || (resp.status >= 200 && resp.status < 300);
  } finally {
    clearTimeout(timeout);
  }
}

async function collectProviderDiagnostics(req?: { headers: Record<string, string | string[] | undefined> }) {
  const keys = req ? extractKeys(req) : null;
  const probes = {
    groq: await runProviderProbe(groqEnabled, async () => {
      const list = await groqClient.models.list();
      return list.data.length > 0;
    }),
    ollama: await runProviderProbe(ollamaEnabled, async () => {
      const list = await ollamaClient.models.list();
      return list.data.length > 0;
    }),
    nvidia: await runProviderProbe(Boolean(nvidiaEnabled && nvidiaClient), async () => {
      // Use model listing instead of inference — no tokens consumed
      const list = await nvidiaClient!.models.list();
      return list.data.length > 0;
    }),
    serper: await runProviderProbe(Boolean(keys?.serperKey?.trim()), async () =>
      probeFetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": keys!.serperKey!.trim(),
        },
        body: JSON.stringify({ q: "test", gl: "in", hl: "en", num: 1 }),
      }, [200, 400])
    ),
    brave: await runProviderProbe(Boolean(keys?.braveKey?.trim()), async () =>
      probeFetch("https://api.search.brave.com/res/v1/web/search?q=test", {
        headers: {
          "Accept": "application/json",
          "X-Subscription-Token": keys!.braveKey!.trim(),
        },
      }, [200, 400])
    ),
    jina: await runProviderProbe(Boolean(keys?.jinaKey?.trim()), async () =>
      probeFetch("https://r.jina.ai/https://example.com", {
        headers: {
          "Authorization": `Bearer ${keys!.jinaKey!.trim()}`,
          "Accept": "text/plain",
        },
      }, [200])
    ),
  };

  return buildProviderDiagnostics({
    uptime: process.uptime(),
    providers: probes,
  });
}

// Cache health probe results for 30 seconds to avoid burning tokens on every /health hit
let healthCache: { result: ReturnType<typeof buildProviderDiagnostics>; ts: number } | null = null;
const HEALTH_CACHE_TTL_MS = 30_000;

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

router.get("/health", async (req, res, next) => {
  try {
    const now = Date.now();
    if (healthCache && now - healthCache.ts < HEALTH_CACHE_TTL_MS) {
      res.status(healthCache.result.status === "ok" ? 200 : 503).json(healthCache.result);
      return;
    }
    const diagnostics = await collectProviderDiagnostics(req);
    healthCache = { result: diagnostics, ts: now };
    res.status(diagnostics.status === "ok" ? 200 : 503).json(diagnostics);
  } catch (err) {
    next(err);
  }
});

router.get("/search/status", (req, res) => {
  const keys = extractKeys(req);

  const hasTavily = !!keys.tavilyKey;
  const hasBrave = !!keys.braveKey;
  const hasSerper = !!keys.serperKey;
  const hasJina = !!keys.jinaKey;

  const activeEngine =
    (hasTavily && hasBrave) ? "dual (Tavily + Brave)" :
    (hasTavily && hasSerper) ? "dual (Tavily + Serper)" :
    hasTavily ? "single (Tavily)" :
    hasBrave ? "single (Brave)" :
    hasSerper ? "single (Serper)" :
    "fallback (DDG Instant — severely limited)";

  const quality =
    (hasTavily && (hasBrave || hasSerper)) ? "high" :
    (hasTavily || hasBrave || hasSerper) ? "medium" :
    "critical";

  res.json({
    engines: { tavily: hasTavily, brave: hasBrave, serper: hasSerper },
    reranker: { jina: hasJina },
    activeEngine,
    quality,
    dualEngineActive: hasTavily && (hasBrave || hasSerper),
    warning: quality === "critical"
      ? "CRITICAL: No premium search API configured. Research quality is near-zero. Add TAVILY_API_KEY + BRAVE_API_KEY to .env or Settings → Keys."
      : quality === "medium"
        ? "Running single-engine search. Add a second search API key for dual-engine mode (40-60% more source coverage)."
        : null,
  });
});

router.get("/health/retrieval", (_req, res) => {
  res.json({
    engineHealth: getSearchEngineHealth(),
    telemetry: telemetry.snapshot(),
    rerankerMode: {
      jinaUsage: telemetry.getCount("reranker.jina_used"),
      localFallback: telemetry.getCount("reranker.local_fallback"),
    },
    evidenceCache: {
      hits: telemetry.getCount("evidence_cache.hit"),
      misses: telemetry.getCount("evidence_cache.miss"),
    },
    promptHealth: {
      emergencyCompressions: telemetry.getCount("prompt.emergency_compression"),
      hallucinationBlocks: telemetry.getCount("hallucination.guard.blocked"),
    },
  });
});

export default router;

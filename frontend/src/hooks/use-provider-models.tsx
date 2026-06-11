import { useCallback, useEffect, useMemo, useRef, createContext, useContext, useState, ReactNode } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { getProviderHeaders, getProviderHeadersFromKeys, loadProviderKeys, type ProviderKeys } from "@/lib/provider-keys";
import {
  buildHealthyResearchModels,
  deriveStatusFromModelRoute,
  failedConfiguredStatus,
  isProviderDisplayable,
  missingStatus,
  MODEL_PROVIDERS,
  normalizeProviderModels,
  normalizeProviderStatus,
  STATUS_PROVIDERS,
  type ModelProviderName,
  type ProviderModel,
  type ProviderModelPatch,
  type ProviderModels,
  type ProviderName,
  type ProviderRuntimeStatus,
  type ProviderStatusMap,
  type ProviderStatusPatch,
} from "./provider-models";

export type {
  ModelProviderName,
  ProviderModel,
  ProviderModels,
  ProviderName,
  ProviderRuntimeStatus,
  ProviderRuntimeStatusValue,
  ProviderStatusMap,
} from "./provider-models";

const DEFAULT_SELECTED_MODEL = "groq/llama-3.3-70b-versatile";
const PROVIDER_REFRESH_TIMEOUT_MS = 12_000;
const PROVIDER_MODELS_UPDATED_EVENT = "bestdel:provider-models-updated";

function normalizeStoredSelectedModel(model: string | null | undefined): string {
  const trimmed = model?.trim();
  if (!trimmed) return DEFAULT_SELECTED_MODEL;
  if (/^nvidia\/nvidia\//i.test(trimmed)) return trimmed;
  if (/^nvidia\/(?:llama-|nemotron-)/i.test(trimmed)) return `nvidia/${trimmed}`;
  if (/^(?:llama-.*nemotron|nemotron-)/i.test(trimmed)) return `nvidia/nvidia/${trimmed}`;
  return trimmed;
}

function emptyModels(): ProviderModels {
  return { groq: [], openrouter: [], nvidia: [], github: [], gemini: [], ollama: [], cerebras: [] };
}

function mergeProviderModels(prev: ProviderModels, patch?: ProviderModelPatch): ProviderModels {
  if (!patch) return prev;
  return {
    groq: patch.groq ?? prev.groq,
    openrouter: patch.openrouter ?? prev.openrouter,
    nvidia: patch.nvidia ?? prev.nvidia,
    github: patch.github ?? prev.github,
    gemini: patch.gemini ?? prev.gemini,
    ollama: patch.ollama ?? prev.ollama,
    cerebras: patch.cerebras ?? prev.cerebras,
  };
}

function initialStatuses(): ProviderStatusMap {
  return Object.fromEntries(STATUS_PROVIDERS.map((provider) => [provider, missingStatus(provider)])) as ProviderStatusMap;
}

function configuredByProvider(keys: ProviderKeys): Record<ProviderName, boolean> {
  return {
    groq: Boolean(keys.groqApiKey.trim()),
    openrouter: Boolean(keys.openrouterApiKey.trim()),
    nvidia: Boolean(keys.nvidiaApiKey.trim()),
    github: Boolean(keys.githubModelsApiKey.trim()),
    gemini: Boolean(keys.geminiApiKey.trim()),
    ollama: Boolean(keys.ollamaApiKey.trim() || keys.ollamaBaseUrl.trim()),
    cerebras: Boolean(keys.cerebrasApiKey.trim()),
    tavily: Boolean(keys.tavilyApiKey.trim()),
    exa: Boolean(keys.exaApiKey.trim()),
    jina: Boolean(keys.jinaApiKey.trim()),
    firecrawl: Boolean(keys.firecrawlApiKey.trim()),
    brave: Boolean(keys.braveApiKey.trim()),
    serper: Boolean(keys.serperApiKey.trim()),
  };
}

function checkingStatuses(keys: ProviderKeys): ProviderStatusMap {
  const configured = configuredByProvider(keys);
  return Object.fromEntries(STATUS_PROVIDERS.map((provider) => [provider, configured[provider]
    ? { provider, configured: true, healthy: false, checking: true, status: "checking", modelCount: 0 }
    : missingStatus(provider)])) as ProviderStatusMap;
}

function statusFromSuccessfulModelRoute(provider: ModelProviderName, status: ProviderRuntimeStatus, models: ProviderModel[]): ProviderRuntimeStatus {
  return deriveStatusFromModelRoute(provider, status, models);
}

async function apiFetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = PROVIDER_REFRESH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-cache");
  headers.set("Pragma", "no-cache");
  try {
    return await apiFetch(input, { ...init, cache: "no-store", headers, signal: controller.signal }, 0);
  } finally {
    window.clearTimeout(timer);
  }
}

function debugProviders(...args: unknown[]): void {
  if (import.meta.env.VITE_DEBUG_PROVIDERS === "true") {
    console.debug("[BestDel providers]", ...args);
  }
}

// ── Debounce / In-flight guard ──

const REFRESH_DEBOUNCE_MS = 300;

interface ProviderRuntimeContextValue {
  providerStatus: ProviderStatusMap;
  providerModels: ProviderModels;
  healthyResearchModels: string[];
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  refreshAllProviders: (keysOverride?: ProviderKeys) => Promise<void>;
  isRefreshing: boolean;
  lastRefreshAt: number | null;
  providerErrors: Record<string, string | undefined>;
}

const ProviderRuntimeContext = createContext<ProviderRuntimeContextValue | null>(null);

export function useProviderModels() {
  const ctx = useContext(ProviderRuntimeContext);
  if (!ctx) {
    throw new Error("useProviderModels must be used within ProviderRuntimeProvider");
  }
  return ctx;
}

export function ProviderRuntimeProvider({ children }: { children: ReactNode }) {
  const [providerStatus, setProviderStatus] = useState<ProviderStatusMap>(() => initialStatuses());
  const [providerModels, setProviderModels] = useState<ProviderModels>(() => emptyModels());
  const [selectedModel, setSelectedModelState] = useState<string>(() => {
    try {
      return normalizeStoredSelectedModel(localStorage.getItem("lastNormalModel"));
    } catch {
      return DEFAULT_SELECTED_MODEL;
    }
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);

  const setSelectedModel = useCallback((model: string) => {
    setSelectedModelState(normalizeStoredSelectedModel(model));
  }, []);

  useEffect(() => {
    const normalized = normalizeStoredSelectedModel(selectedModel);
    if (normalized !== selectedModel) {
      setSelectedModelState(normalized);
      return;
    }
    try { localStorage.setItem("lastNormalModel", normalized); } catch {}
  }, [selectedModel]);

  // Track whether a refresh is currently in-flight
  const inFlightRef = useRef<Promise<void> | null>(null);
  // Track the time of the last completed refresh
  const lastRefreshTimeRef = useRef<number>(0);
  // Debounce pending timeout
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Queue of pending keys that arrived while a refresh was in-flight
  const pendingKeysRef = useRef<ProviderKeys | null>(null);

  const refreshProviderStatus = useCallback(async (keysOverride?: ProviderKeys) => {
    const keys = keysOverride ?? loadProviderKeys();
    const providerHeaders = getProviderHeadersFromKeys(keys);
    setIsRefreshing(true);
    setProviderStatus(checkingStatuses(keys));
    debugProviders("status refresh started", Object.keys(providerHeaders));
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const response = await apiFetchWithTimeout(`${base}/api/providers/status?bypass=true&refresh=${Date.now()}`, { headers: providerHeaders });
      const payload = await response.json().catch(() => null);
      debugProviders(`status route: HTTP ${response.status} hasProviders=${Boolean(payload?.providers)}`);
      if (payload?.providers?.nvidia) {
        debugProviders(`status route nvidia: status=${payload.providers.nvidia.status} healthy=${payload.providers.nvidia.healthy} configured=${payload.providers.nvidia.configured} modelCount=${payload.providers.nvidia.modelCount} canListModels=${payload.providers.nvidia.canListModels}`);
      }
      if (!response.ok || !payload?.providers) {
        throw new Error(`Provider status refresh failed with HTTP ${response.status}`);
      }
      const next = initialStatuses();
      for (const provider of STATUS_PROVIDERS) {
        next[provider] = normalizeProviderStatus(provider, payload?.providers?.[provider]);
      }
      setProviderStatus(next);
      setLastRefreshAt(Date.now());
      debugProviders("status response", next);
      console.debug("[BestDel providers] Status after refresh:", JSON.stringify(next, (key, val) => key === 'error' ? undefined : val));
    } catch (err) {
      const configured = configuredByProvider(keys);
      setProviderStatus(Object.fromEntries(STATUS_PROVIDERS.map((provider) => [provider, configured[provider]
        ? { provider, configured: true, healthy: false, checking: false, status: "network_error" as const, modelCount: 0, error: "Provider status refresh failed" }
        : missingStatus(provider)])) as ProviderStatusMap);
      debugProviders("status refresh failed", err);
      console.error("[BestDel providers] Status refresh failed:", err);
    }
  }, []);

  const refreshProviderModels = useCallback(async (keysOverride?: ProviderKeys) => {
    const keys = keysOverride ?? loadProviderKeys();
    const providerHeaders = getProviderHeadersFromKeys(keys);
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const refreshToken = `${Date.now()}`;
    debugProviders("model refresh started", Object.keys(providerHeaders));
    
    const results = await Promise.allSettled(MODEL_PROVIDERS.map(async (provider) => {
      try {
        const response = await apiFetchWithTimeout(`${base}/api/${provider}/models?refresh=${refreshToken}`, { headers: providerHeaders });
        debugProviders(`model route ${provider}: HTTP ${response.status} ${response.ok ? "OK" : "FAIL"}`);
        
        // Log if JSON fails even though response is OK
        const payload = await response.json().catch(() => null);
        if (response.ok && payload === null) {
          console.warn(`[BestDel providers] JSON parse failed for ${provider} models — response was 200 but body is not valid JSON`);
        }
        if (payload !== null) {
          debugProviders(`model route ${provider}: payload has provider=${Boolean(payload?.provider)} status=${payload?.status} modelCount=${payload?.modelCount}`);
        }
        
        if (!payload?.provider && !response.ok) {
          throw new Error(`${provider} model refresh failed with HTTP ${response.status}`);
        }
        
        const returnedModels = normalizeProviderModels(provider, payload);
        debugProviders(`model route ${provider}: normalizeProviderModels returned ${returnedModels.length} models`);
        
        const statusPayload = payload?.provider ? payload : {
          provider,
          configured: response.ok,
          healthy: response.ok && returnedModels.length > 0,
          status: response.ok && returnedModels.length > 0 ? "healthy" : "network_error",
          source: "live",
          modelCount: returnedModels.length,
        };
        
        const status = response.ok
          ? statusFromSuccessfulModelRoute(provider, normalizeProviderStatus(provider, statusPayload), returnedModels)
          : normalizeProviderStatus(provider, statusPayload);
        
        debugProviders(`model route ${provider}: resolved status=${status.status} healthy=${status.healthy} configured=${status.configured} modelCount=${status.modelCount}`);
        
        const models = (status.availableForDisplay ?? isProviderDisplayable(status, returnedModels)) ? returnedModels : [];
        return { provider, status, models };
      } catch (err) {
        console.warn(`[BestDel providers] Model refresh failed for ${provider}:`, err);
        return { provider, status: failedConfiguredStatus(provider, String(err)), models: [] };
      }
    }));
    
    const nextModels: ProviderModelPatch = {};
    const nextStatus: ProviderStatusPatch = {};
    
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      nextModels[result.value.provider] = result.value.models;
      nextStatus[result.value.provider] = result.value.status;
    }
    
    const configured = configuredByProvider(keys);
    MODEL_PROVIDERS.forEach((provider, index) => {
      if (results[index]?.status === "rejected" && configured[provider]) {
        nextStatus[provider] = failedConfiguredStatus(provider, "Provider model refresh failed");
        nextModels[provider] = [];
      }
    });
    
    setProviderModels((prev) => mergeProviderModels(prev, nextModels));
    setProviderStatus((prev) => ({ ...prev, ...nextStatus }));
    
    const refreshedAt = Date.now();
    setLastRefreshAt(refreshedAt);
    broadcastProviderModelsUpdated(nextModels, nextStatus, refreshedAt);
    debugProviders("model counts", Object.fromEntries(MODEL_PROVIDERS.map((provider) => [provider, nextModels[provider]?.length ?? 0])));
    console.debug("[BestDel providers] Models after refresh:", Object.fromEntries(MODEL_PROVIDERS.filter(p => nextModels[p]?.length).map(p => [p, nextModels[p]?.length])));
    console.debug("[BestDel providers] Status after model refresh:", Object.fromEntries(MODEL_PROVIDERS.map(p => [p, { status: nextStatus[p]?.status, healthy: nextStatus[p]?.healthy }])));
  }, []);

  const refreshAllProviders = useCallback(async (keysOverride?: ProviderKeys) => {
    // If a refresh is already in-flight, queue the latest keys so we
    // re-run after it completes instead of silently dropping this call.
    if (inFlightRef.current) {
      debugProviders("refreshAllProviders: queuing pending keys");
      pendingKeysRef.current = keysOverride ?? loadProviderKeys();
      return inFlightRef.current;
    }
    
    // Debounce: skip if last refresh was too recent (unless force)
    const now = Date.now();
    if (now - lastRefreshTimeRef.current < REFRESH_DEBOUNCE_MS) {
      debugProviders("refreshAllProviders: debouncing");
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      const promise = new Promise<void>((resolve) => {
        debounceTimerRef.current = setTimeout(async () => {
          await refreshAllProviders(keysOverride);
          resolve();
        }, REFRESH_DEBOUNCE_MS);
      });
      return promise;
    }
    
    const promise = (async () => {
      const keys = keysOverride ?? loadProviderKeys();
      pendingKeysRef.current = null;
      setIsRefreshing(true);
      try {
        await refreshProviderStatus(keys);
        await refreshProviderModels(keys);
      } finally {
        setIsRefreshing(false);
        lastRefreshTimeRef.current = Date.now();
        inFlightRef.current = null;
        // If keys were queued while we were running, fire again with them
        if (pendingKeysRef.current) {
          const queuedKeys = pendingKeysRef.current;
          pendingKeysRef.current = null;
          void refreshAllProviders(queuedKeys);
        }
      }
    })();
    
    inFlightRef.current = promise;
    await promise;
  }, [refreshProviderStatus, refreshProviderModels]);

  // Wire up event listeners
  useEffect(() => {
    const handleProviderKeysUpdated = (event: Event) => {
      const keys = (event as CustomEvent<{ keys?: ProviderKeys }>).detail?.keys;
      void refreshAllProviders(keys);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "ai-research:provider-keys:v1") void refreshAllProviders();
    };
    window.addEventListener("bestdel:provider-keys-updated", handleProviderKeysUpdated);
    window.addEventListener("storage", handleStorage);
    
    const handleProviderModelsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{
        providerModels?: ProviderModelPatch;
        providerStatus?: ProviderStatusPatch;
        lastRefreshAt?: number;
      }>).detail;
      if (!detail) return;
      if (detail.providerModels) {
        setProviderModels((prev) => mergeProviderModels(prev, detail.providerModels));
      }
      if (detail.providerStatus) {
        setProviderStatus((prev) => ({ ...prev, ...detail.providerStatus }));
      }
      if (typeof detail.lastRefreshAt === "number") {
        setLastRefreshAt(detail.lastRefreshAt);
      }
    };
    window.addEventListener(PROVIDER_MODELS_UPDATED_EVENT, handleProviderModelsUpdated);
    
    const handleChatSuccessful = (event: Event) => {
      const detail = (event as CustomEvent<{ provider?: string; model?: string }>).detail;
      if (!detail?.provider) return;
      const providerName = detail.provider as ProviderName;
      if (!STATUS_PROVIDERS.includes(providerName)) return;
      setProviderStatus((prev) => ({
        ...prev,
        [providerName]: {
          ...prev[providerName],
          healthy: true,
          checking: false,
          status: "healthy",
          configured: true,
          modelCount: prev[providerName]?.modelCount || 1,
          canChat: true,
          chatVerified: true,
          catalogFallbackOnly: false,
          availableForResearch: true,
          error: undefined,
        },
      }));
    };
    window.addEventListener("bestdel:chat-provider-success", handleChatSuccessful);
    
    // Initial refresh
    void refreshAllProviders();
    
    return () => {
      window.removeEventListener("bestdel:provider-keys-updated", handleProviderKeysUpdated);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(PROVIDER_MODELS_UPDATED_EVENT, handleProviderModelsUpdated);
      window.removeEventListener("bestdel:chat-provider-success", handleChatSuccessful);
    };
  }, [refreshAllProviders]);

  const healthyResearchModels = useMemo(() => buildHealthyResearchModels(providerStatus, providerModels), [providerModels, providerStatus]);

  const providerErrors = useMemo(() => Object.fromEntries(Object.entries(providerStatus)
    .filter(([, status]) => status.error)
    .map(([provider, status]) => [provider, status.error])), [providerStatus]);

  const contextValue = useMemo(() => ({
    providerStatus,
    providerModels,
    healthyResearchModels,
    selectedModel,
    setSelectedModel,
    refreshAllProviders,
    isRefreshing,
    lastRefreshAt,
    providerErrors,
  }), [providerStatus, providerModels, healthyResearchModels, selectedModel, setSelectedModel, refreshAllProviders, isRefreshing, lastRefreshAt, providerErrors]);

  return (
    <ProviderRuntimeContext.Provider value={contextValue}>
      {children}
    </ProviderRuntimeContext.Provider>
  );
}

function broadcastProviderModelsUpdated(
  providerModels: ProviderModelPatch,
  providerStatus: ProviderStatusPatch,
  lastRefreshAt: number,
): void {
  window.dispatchEvent(new CustomEvent(PROVIDER_MODELS_UPDATED_EVENT, {
    detail: { providerModels, providerStatus, lastRefreshAt },
  }));
}

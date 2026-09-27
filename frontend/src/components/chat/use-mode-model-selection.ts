import { useCallback, useEffect, useMemo, useState } from "react";
import { repairSelectedModel, repairSelectedModelList } from "@/hooks/provider-models";
import type { ChatMode } from "./chat-model-routing";
import { DEFAULT_GROQ_MODEL, VALID_MODEL_PREFIXES, isKnownUnavailableChatModel } from "./provider-model-display";

const WEB_MODELS_KEY = "lastWebSearchModels";
const DEEP_MODELS_KEY = "lastDeepResearchModels";
const WEB_AUTO_KEY = "lastWebSearchAuto";
const DEEP_AUTO_KEY = "lastDeepResearchAuto";
const UNSTABLE_RESEARCH_MODEL_PATTERN = /^(nvidia\/moonshotai\/kimi-k2\.6|nvidia\/nvidia\/nemotron-3-ultra-550b-a55b|openrouter\/nvidia\/nemotron-3-ultra-550b-a55b(?::free)?)$/i;

/** Auto-pick sizes: fast stays cheap (2), deep/council gets coverage (3). */
export const AUTO_MODEL_COUNTS = { fast: 2, deep: 3 } as const;

export interface ModelPreset {
  id: string;
  label: string;
  hint: string;
  /** Manual-model count the preset resolves to (round-robin across providers). */
  count: number;
}

export const RESEARCH_MODEL_PRESETS: ModelPreset[] = [
  { id: "solo", label: "Solo", hint: "1 model · cheapest", count: 1 },
  { id: "balanced", label: "Balanced", hint: "2 models", count: 2 },
  { id: "max", label: "Max", hint: "4 models · best coverage", count: 4 },
];

/**
 * Round-robin across providers so one provider outage/rate-limit never takes
 * out the whole run. Preserves healthy-list order within each provider.
 */
export function pickAutoModels(healthyResearchModels: string[], count: number): string[] {
  const groups = new Map<string, string[]>();
  for (const model of healthyResearchModels) {
    if (isKnownUnstableResearchModel(model)) continue;
    const provider = model.split("/")[0] ?? "other";
    const list = groups.get(provider);
    if (list) list.push(model);
    else groups.set(provider, [model]);
  }
  const lists = [...groups.values()];
  const picked: string[] = [];
  let row = 0;
  while (picked.length < count && lists.some((list) => list.length > row)) {
    for (const list of lists) {
      if (picked.length >= count) break;
      const model = list[row];
      if (model && !picked.includes(model)) picked.push(model);
    }
    row++;
  }
  return picked;
}

/** Resolve a preset id to concrete models. Empty when nothing healthy. */
export function resolvePresetModels(presetId: string, healthyResearchModels: string[]): string[] {
  const preset = RESEARCH_MODEL_PRESETS.find((item) => item.id === presetId);
  if (!preset) return [];
  return pickAutoModels(healthyResearchModels, preset.count);
}

export interface ModeModelSelectionState {
  normalModel: string;
  webSearchModels: string[];
  deepResearchModels: string[];
}

interface UseModeModelSelectionInput {
  normalModel: string;
  setNormalModel: (model: string) => void;
  healthyResearchModels: string[];
  defaultModel?: string;
}

export function resolveModeModelSelection(mode: ChatMode | "web_search", state: ModeModelSelectionState): string[] {
  if (mode === "normal") return [state.normalModel];
  if (mode === "fast_research" || mode === "web_search") return state.webSearchModels;
  return state.deepResearchModels;
}

export function resolvePrimaryModeModel(mode: ChatMode | "web_search", state: ModeModelSelectionState): string {
  return resolveModeModelSelection(mode, state)[0] ?? state.normalModel;
}

export function repairModeModelSelection(
  state: ModeModelSelectionState,
  healthyResearchModels: string[],
): ModeModelSelectionState {
  const stableWebSearchModels = state.webSearchModels.filter((model) => !isKnownUnstableResearchModel(model));
  const stableDeepResearchModels = state.deepResearchModels.filter((model) => !isKnownUnstableResearchModel(model));
  const stableNormalModel = isKnownUnstableResearchModel(state.normalModel) ? "" : state.normalModel;
  if (healthyResearchModels.length === 0) return state;
  return {
    normalModel: repairSelectedModel(stableNormalModel, healthyResearchModels) ?? state.normalModel,
    webSearchModels: repairSelectedModelList(stableWebSearchModels, healthyResearchModels),
    deepResearchModels: repairSelectedModelList(stableDeepResearchModels, healthyResearchModels),
  };
}

export function useModeModelSelection({
  normalModel,
  healthyResearchModels,
  defaultModel = DEFAULT_GROQ_MODEL,
}: UseModeModelSelectionInput) {
  const [rawWebSearchModels, setRawWebSearchModels] = useState<string[]>(() => loadModelList(WEB_MODELS_KEY, defaultModel));
  const [rawDeepResearchModels, setRawDeepResearchModels] = useState<string[]>(() => loadModelList(DEEP_MODELS_KEY, defaultModel));
  // Auto is the default: most users should never hand-pick 4 models.
  // Manual lists are preserved underneath so toggling back restores them.
  const [webAuto, setWebAutoState] = useState<boolean>(() => loadAutoFlag(WEB_AUTO_KEY, true));
  const [deepAuto, setDeepAutoState] = useState<boolean>(() => loadAutoFlag(DEEP_AUTO_KEY, true));

  const selectionState = useMemo<ModeModelSelectionState>(() => {
    return repairModeModelSelection({
      normalModel,
      webSearchModels: rawWebSearchModels,
      deepResearchModels: rawDeepResearchModels,
    }, healthyResearchModels);
  }, [healthyResearchModels, normalModel, rawDeepResearchModels, rawWebSearchModels]);

  const { webSearchModels, deepResearchModels } = selectionState;

  const setWebSearchModels = useCallback((models: string[]) => {
    setRawWebSearchModels(repairSelectedModelList(models.filter((model) => !isKnownUnstableResearchModel(model)), healthyResearchModels));
  }, [healthyResearchModels]);

  const setDeepResearchModels = useCallback((models: string[]) => {
    setRawDeepResearchModels(repairSelectedModelList(models.filter((model) => !isKnownUnstableResearchModel(model)), healthyResearchModels));
  }, [healthyResearchModels]);

  useEffect(() => {
    try { localStorage.setItem(WEB_MODELS_KEY, JSON.stringify(webSearchModels)); } catch {}
  }, [webSearchModels]);

  useEffect(() => {
    try { localStorage.setItem(DEEP_MODELS_KEY, JSON.stringify(deepResearchModels)); } catch {}
  }, [deepResearchModels]);

  useEffect(() => {
    try { localStorage.setItem(WEB_AUTO_KEY, JSON.stringify(webAuto)); } catch {}
  }, [webAuto]);

  useEffect(() => {
    try { localStorage.setItem(DEEP_AUTO_KEY, JSON.stringify(deepAuto)); } catch {}
  }, [deepAuto]);

  const setWebAuto = useCallback((auto: boolean) => setWebAutoState(auto), []);
  const setDeepAuto = useCallback((auto: boolean) => setDeepAutoState(auto), []);

  const isAutoForMode = useCallback((mode: ChatMode | "web_search"): boolean => {
    if (mode === "fast_research" || mode === "web_search") return webAuto;
    if (mode === "deep_research" || mode === "council") return deepAuto;
    return false;
  }, [webAuto, deepAuto]);

  const resolveAutoModels = useCallback((mode: ChatMode | "web_search"): string[] | null => {
    if (mode === "fast_research" || mode === "web_search") {
      if (!webAuto || healthyResearchModels.length === 0) return null;
      return pickAutoModels(healthyResearchModels, AUTO_MODEL_COUNTS.fast);
    }
    if (mode === "deep_research" || mode === "council") {
      if (!deepAuto || healthyResearchModels.length === 0) return null;
      return pickAutoModels(healthyResearchModels, AUTO_MODEL_COUNTS.deep);
    }
    return null;
  }, [webAuto, deepAuto, healthyResearchModels]);

  const getModelsForMode = useCallback((mode: ChatMode | "web_search", fallbackNormalModel = normalModel): string[] => {
    const auto = resolveAutoModels(mode);
    if (auto && auto.length > 0) return auto;
    const stateForMode = repairModeModelSelection({
      ...selectionState,
      normalModel: fallbackNormalModel,
    }, healthyResearchModels);
    return resolveModeModelSelection(mode, stateForMode);
  }, [healthyResearchModels, normalModel, resolveAutoModels, selectionState]);

  const getPrimaryModelForMode = useCallback((mode: ChatMode | "web_search", fallbackNormalModel = normalModel): string => {
    const auto = resolveAutoModels(mode);
    if (auto && auto.length > 0) return auto[0];
    const stateForMode = repairModeModelSelection({
      ...selectionState,
      normalModel: fallbackNormalModel,
    }, healthyResearchModels);
    return resolvePrimaryModeModel(mode, stateForMode);
  }, [healthyResearchModels, normalModel, resolveAutoModels, selectionState]);

  return {
    selectionState,
    webSearchModels,
    setWebSearchModels,
    deepResearchModels,
    setDeepResearchModels,
    webAuto,
    setWebAuto,
    deepAuto,
    setDeepAuto,
    isAutoForMode,
    getModelsForMode,
    getPrimaryModelForMode,
  };
}

function loadAutoFlag(key: string, fallback: boolean): boolean {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    if (typeof saved === "boolean") return saved;
  } catch {}
  return fallback;
}

function loadModelList(key: string, defaultModel: string): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (Array.isArray(saved) && saved.length > 0 && saved.every((model) => typeof model === "string") && VALID_MODEL_PREFIXES.some((prefix) => saved[0]?.startsWith(prefix))) {
      const stable = saved
        .map(normalizeStoredModelId)
        .filter((model) => !isKnownUnstableResearchModel(model));
      return stable.length > 0 ? stable : [defaultModel];
    }
  } catch {}
  return [defaultModel];
}

export function isKnownUnstableResearchModel(model: string): boolean {
  return UNSTABLE_RESEARCH_MODEL_PATTERN.test(model) || isKnownUnavailableChatModel(model);
}

function normalizeStoredModelId(model: string): string {
  const trimmed = model.trim();
  if (/^nvidia\/nvidia\//i.test(trimmed)) return trimmed;
  if (/^nvidia\/(?:llama-|nemotron-)/i.test(trimmed)) return `nvidia/${trimmed}`;
  if (/^(?:llama-.*nemotron|nemotron-)/i.test(trimmed)) return `nvidia/nvidia/${trimmed}`;
  return trimmed;
}

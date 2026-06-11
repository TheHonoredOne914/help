import { useCallback, useEffect, useMemo, useState } from "react";
import { repairSelectedModel, repairSelectedModelList } from "@/hooks/provider-models";
import type { ChatMode } from "./chat-model-routing";
import { DEFAULT_GROQ_MODEL, VALID_MODEL_PREFIXES } from "./provider-model-display";

const WEB_MODELS_KEY = "lastWebSearchModels";
const DEEP_MODELS_KEY = "lastDeepResearchModels";
const UNSTABLE_RESEARCH_MODEL_PATTERN = /^(nvidia\/moonshotai\/kimi-k2\.6|nvidia\/nvidia\/nemotron-3-ultra-550b-a55b|openrouter\/nvidia\/nemotron-3-ultra-550b-a55b(?::free)?)$/i;

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

  const getModelsForMode = useCallback((mode: ChatMode | "web_search", fallbackNormalModel = normalModel): string[] => {
    const stateForMode = repairModeModelSelection({
      ...selectionState,
      normalModel: fallbackNormalModel,
    }, healthyResearchModels);
    return resolveModeModelSelection(mode, stateForMode);
  }, [healthyResearchModels, normalModel, selectionState]);

  const getPrimaryModelForMode = useCallback((mode: ChatMode | "web_search", fallbackNormalModel = normalModel): string => {
    const stateForMode = repairModeModelSelection({
      ...selectionState,
      normalModel: fallbackNormalModel,
    }, healthyResearchModels);
    return resolvePrimaryModeModel(mode, stateForMode);
  }, [healthyResearchModels, normalModel, selectionState]);

  return {
    selectionState,
    webSearchModels,
    setWebSearchModels,
    deepResearchModels,
    setDeepResearchModels,
    getModelsForMode,
    getPrimaryModelForMode,
  };
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
  return UNSTABLE_RESEARCH_MODEL_PATTERN.test(model);
}

function normalizeStoredModelId(model: string): string {
  const trimmed = model.trim();
  if (/^nvidia\/nvidia\//i.test(trimmed)) return trimmed;
  if (/^nvidia\/(?:llama-|nemotron-)/i.test(trimmed)) return `nvidia/${trimmed}`;
  if (/^(?:llama-.*nemotron|nemotron-)/i.test(trimmed)) return `nvidia/nvidia/${trimmed}`;
  return trimmed;
}

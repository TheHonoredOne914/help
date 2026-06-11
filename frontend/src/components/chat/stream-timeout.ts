import type { ChatMode } from "./chat-model-routing";

export function getStreamSilenceTimeoutMs(mode: ChatMode, activeModels: string[]): number {
  if (mode === "deep_research" || mode === "council") {
    return 240_000;
  }
  if (activeModels.length > 1) {
    return 150_000;
  }
  return 60_000;
}


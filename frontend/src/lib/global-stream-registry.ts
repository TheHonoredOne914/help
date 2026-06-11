import type { StreamControllerRegistry } from "@/components/chat/stream-controller-registry";
import type { ChatRunIdentity } from "@/components/chat/stream-event-normalizer";
import {
  abortAllStreamControllers,
  abortConversationControllers,
  addStreamController,
  moveStreamController,
  abortRunController,
} from "@/components/chat/stream-controller-registry";

// Module-level singleton — survives component remounts
const _registry: StreamControllerRegistry = {};

// Active run identity stored at module level — survives component remounts
const _activeRun: { current: ChatRunIdentity } = {
  current: { runId: null, assistantMessageId: null, conversationId: null },
};

export const globalStreamRegistry = {
  add: (runId: string, controller: AbortController, conversationId: number) =>
    addStreamController(_registry, runId, controller, conversationId),

  move: (prevRunId: string, nextRunId: string) =>
    moveStreamController(_registry, prevRunId, nextRunId),

  abortRun: (runId: string | null | undefined) =>
    abortRunController(_registry, runId),

  abortConversation: (conversationId: number | null | undefined) =>
    abortConversationControllers(_registry, conversationId),

  abortAll: () =>
    abortAllStreamControllers(_registry),

  // Read-only size for debugging
  get size() { return Object.keys(_registry).length; },

  // Active run identity accessors
  getActiveRun: (): ChatRunIdentity => _activeRun.current,
  setActiveRun: (identity: ChatRunIdentity) => { _activeRun.current = { ...identity }; },
  clearActiveRun: () => { _activeRun.current = { runId: null, assistantMessageId: null, conversationId: null }; },
};

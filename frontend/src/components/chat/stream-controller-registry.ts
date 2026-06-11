export interface StreamControllerEntry {
  controller: AbortController;
  conversationId: number;
}

export type StreamControllerRegistry = Record<string, StreamControllerEntry>;

export function addStreamController(
  registry: StreamControllerRegistry,
  runId: string,
  controller: AbortController,
  conversationId: number,
): void {
  registry[runId] = { controller, conversationId };
}

export function moveStreamController(
  registry: StreamControllerRegistry,
  previousRunId: string,
  nextRunId: string,
): void {
  if (previousRunId === nextRunId) return;
  const entry = registry[previousRunId];
  if (!entry || entry.controller.signal.aborted) return;
  registry[nextRunId] = entry;
  delete registry[previousRunId];
}

export function abortRunController(
  registry: StreamControllerRegistry,
  runId: string | null | undefined,
): void {
  if (!runId) return;
  const entry = registry[runId];
  if (!entry) return;
  entry.controller.abort();
  delete registry[runId];
}

export function abortConversationControllers(
  registry: StreamControllerRegistry,
  conversationId: number | null | undefined,
): void {
  if (conversationId == null) return;
  for (const [runId, entry] of Object.entries(registry)) {
    if (entry.conversationId !== conversationId) continue;
    entry.controller.abort();
    delete registry[runId];
  }
}

export function abortAllStreamControllers(registry: StreamControllerRegistry): void {
  for (const [runId, entry] of Object.entries(registry)) {
    entry.controller.abort();
    delete registry[runId];
  }
}

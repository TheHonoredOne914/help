import type { PersistedRunRecord, ResearchRunIdentity } from "./types.js";

export interface ManagedRun {
  identity: ResearchRunIdentity;
  signal: AbortSignal;
  cancel: (reason: string) => Promise<void>;
}

export class RunCancellationManager {
  private readonly runsByConversation = new Map<string, ManagedRun>();

  async startRun(input: {
    identity: ResearchRunIdentity;
    abortController?: AbortController;
    persistCancelled?: (record: PersistedRunRecord, reason: string) => Promise<void>;
  }): Promise<ManagedRun> {
    const key = String(input.identity.conversationId);
    const existing = this.runsByConversation.get(key);
    if (existing && existing.identity.runId !== input.identity.runId) {
      await existing.cancel("superseded_by_new_prompt");
    }
    const controller = input.abortController ?? new AbortController();
    const run: ManagedRun = {
      identity: input.identity,
      signal: controller.signal,
      cancel: async (reason: string) => {
        if (!controller.signal.aborted) controller.abort(reason);
        await input.persistCancelled?.({
          runId: input.identity.runId,
          conversationId: input.identity.conversationId,
          assistantMessageId: input.identity.assistantMessageId,
          phase: "terminal",
          status: "cancelled",
          startedAt: input.identity.createdAt,
          lastHeartbeatAt: new Date().toISOString(),
        }, reason);
      },
    };
    this.runsByConversation.set(key, run);
    return run;
  }

  finishRun(identity: ResearchRunIdentity): void {
    const key = String(identity.conversationId);
    if (this.runsByConversation.get(key)?.identity.runId === identity.runId) {
      this.runsByConversation.delete(key);
    }
  }
}

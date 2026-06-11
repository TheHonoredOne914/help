import {
  embedPipelineMetadata,
  type ResearchTerminalStatus,
} from "../core/pipeline/pipeline-metadata.js";
import { canMergeResearchAnswerIntoArchive } from "../core/archive/archive-merge-safety.js";

export interface AssistantPersistenceStore {
  insertAssistantMessage(conversationId: number, content: string, metadataJson?: string | null, runId?: string | null, runStatus?: string | null): Promise<unknown>;
  updateAssistantMessage(id: number | string, content: string, metadataJson?: string | null, runId?: string | null, runStatus?: string | null): Promise<unknown>;
}

export interface AssistantPersistenceResult {
  action: "inserted" | "updated" | "skipped";
}

export async function persistAssistantCompleted(input: {
  store: AssistantPersistenceStore;
  conversationId: number;
  assistantMessageId?: number | string | null;
  content: string;
  metadata?: unknown | null;
  runId?: string | null;
  terminalStatus?: ResearchTerminalStatus | null;
}): Promise<AssistantPersistenceResult> {
  const content = input.content.trimEnd();
  if (!content.trim()) return { action: "skipped" };
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  if (input.assistantMessageId != null) {
    await input.store.updateAssistantMessage(input.assistantMessageId, content, metadataJson, input.runId, input.terminalStatus);
    return { action: "updated" };
  }

  await input.store.insertAssistantMessage(input.conversationId, content, metadataJson, input.runId, input.terminalStatus);
  return { action: "inserted" };
}

export async function persistAssistantFailed(input: {
  store: AssistantPersistenceStore;
  conversationId: number;
  assistantMessageId?: number | string | null;
  title?: string;
  message: string;
  partialContent?: string;
  metadata?: unknown | null;
}): Promise<AssistantPersistenceResult> {
  const title = input.title?.trim() || "Response Failed";
  const safeMessage = input.message.trim() || "The response could not be completed.";
  const visibleContent = `${title}\n\nReason: ${safeMessage}`;
  const content = input.metadata
    ? embedPipelineMetadata(visibleContent, input.metadata as Record<string, unknown>)
    : visibleContent;
  const metadata = input.metadata as { runId?: string; terminalStatus?: ResearchTerminalStatus } | null | undefined;
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  if (input.assistantMessageId != null) {
    await input.store.updateAssistantMessage(input.assistantMessageId, content, metadataJson, metadata?.runId, metadata?.terminalStatus);
    return { action: "updated" };
  }

  await input.store.insertAssistantMessage(input.conversationId, content, metadataJson, metadata?.runId, metadata?.terminalStatus);
  return { action: "inserted" };
}

export async function maybeMergeArchive(input: {
  terminalStatus: ResearchTerminalStatus;
  qualityGate?: { passed?: boolean; repairRequired?: boolean } | null;
  legacyFallbackUsed?: boolean;
  sourceContract?: { passedStrict?: boolean; status?: "passed" | "passed_with_source_gaps" | "failed" } | null;
  finalAnswer: string;
  allowCompletedWithSourceGaps?: boolean;
  merge: () => Promise<unknown>;
}): Promise<boolean> {
  const allowed = canMergeResearchAnswerIntoArchive({
    terminalStatus: input.terminalStatus,
    qualityGate: input.qualityGate,
    legacyFallbackUsed: input.legacyFallbackUsed,
    sourceContract: input.sourceContract
      ? {
          passedStrict: input.sourceContract.passedStrict === true,
          status: input.sourceContract.status ?? (input.sourceContract.passedStrict ? "passed" : "failed"),
        }
      : null,
    finalAnswer: input.finalAnswer,
    allowCompletedWithSourceGaps: input.allowCompletedWithSourceGaps,
  });

  if (!allowed) return false;
  await input.merge();
  return true;
}

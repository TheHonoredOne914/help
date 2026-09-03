import { createMessageFromJson, updateMessage } from "../../db.js";
import type { ResearchRunIdentity } from "../../core/pipeline/pipeline-events.js";
import { persistAssistantFailed } from "../assistant-persistence.js";
import {
  buildLegacyTerminalMetadata,
  type PipelineMetadata,
} from "./pipeline-types.js";

export const assistantPersistenceStore = {
  async insertAssistantMessage(conversationId: number, content: string, metadataJson?: string | null, runId?: string | null, runStatus?: string | null) {
    await createMessageFromJson(conversationId, "assistant", content, metadataJson ?? null, runId ?? null, runStatus ?? null);
  },
  async updateAssistantMessage(id: number | string, content: string, metadataJson?: string | null, runId?: string | null, runStatus?: string | null) {
    await updateMessage(Number(id), {
      content,
      ...(metadataJson !== undefined ? { metadataJson } : {}),
      ...(runId !== undefined ? { runId } : {}),
      ...(runStatus !== undefined ? { runStatus } : {}),
    });
  },
};

export async function persistResearchExhausted(input: {
  conversationId: number;
  runIdentity?: ResearchRunIdentity;
  citationEligibleSources: number;
  send: (data: object) => void;
  metadata?: PipelineMetadata;
}): Promise<PipelineMetadata["terminalStatus"]> {
  const terminalStatus: PipelineMetadata["terminalStatus"] =
    input.citationEligibleSources > 0 ? "completed_with_source_gaps" : "failed";
  const message = input.citationEligibleSources > 0
    ? "Research retrieved some evidence, but every model/context batch was exhausted before a validated final answer could be produced."
    : "Research could not retrieve usable evidence, so no validated final answer was produced.";
  const metadata = buildLegacyTerminalMetadata(input.runIdentity, terminalStatus, {
    ...input.metadata,
    terminalStatus,
    sourceGapReport: {
      reason: "both_exhausted",
      citationEligibleSources: input.citationEligibleSources,
      message,
    },
  });

  await persistAssistantFailed({
    store: assistantPersistenceStore,
    conversationId: input.conversationId,
    assistantMessageId: input.runIdentity?.assistantMessageId,
    title: terminalStatus === "failed" ? "Research Failed" : "Research Completed With Source Gaps",
    message,
    metadata,
  });
  input.send({
    eventType: terminalStatus,
    bothExhausted: true,
    done: true,
    terminalStatus,
    sourceGapReport: metadata.sourceGapReport,
  });
  return terminalStatus;
}

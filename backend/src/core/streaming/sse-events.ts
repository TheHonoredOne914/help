import { makePipelineEvent, type PipelineEvent, type PipelineEventType } from "../pipeline/pipeline-events.js";

export type { PipelineEvent, PipelineEventType };

export function makeSseEvent(requestId: string, type: PipelineEventType, data?: unknown): PipelineEvent {
  return makePipelineEvent(type, requestId, data && typeof data === "object" ? data as Record<string, unknown> : { value: data });
}

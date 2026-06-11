import type { RunResultSnapshot } from "./types.js";
import { serializeSnapshotForPersistence } from "./result-serializer.js";

export interface RunPersistenceStore {
  insertAssistantMessage(conversationId: number, content: string, metadataJson?: string | null, runId?: string | null, runStatus?: string | null): Promise<unknown>;
  updateAssistantMessage(id: number | string, content: string, metadataJson?: string | null, runId?: string | null, runStatus?: string | null): Promise<unknown>;
}

export async function persistRunSnapshot(input: {
  store: RunPersistenceStore;
  conversationId: number;
  assistantMessageId?: number | string | null;
  snapshot: RunResultSnapshot;
}): Promise<"inserted" | "updated"> {
  const serialized = serializeSnapshotForPersistence(input.snapshot);
  if (input.assistantMessageId != null) {
    await input.store.updateAssistantMessage(
      input.assistantMessageId,
      serialized.content,
      serialized.metadataJson,
      input.snapshot.runIdentity.runId,
      input.snapshot.terminalStatus,
    );
    return "updated";
  }
  await input.store.insertAssistantMessage(
    input.conversationId,
    serialized.content,
    serialized.metadataJson,
    input.snapshot.runIdentity.runId,
    input.snapshot.terminalStatus,
  );
  return "inserted";
}

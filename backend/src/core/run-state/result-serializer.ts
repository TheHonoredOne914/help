import { embedPipelineMetadata } from "../pipeline/pipeline-metadata.js";
import { buildPipelineMetadataFromSnapshot } from "./metadata-builder.js";
import type { RunResultSnapshot } from "./types.js";

export function serializeSnapshotForPersistence(snapshot: RunResultSnapshot): { content: string; metadataJson: string } {
  const metadata = buildPipelineMetadataFromSnapshot(snapshot);
  return {
    content: embedPipelineMetadata(snapshot.finalAnswer, metadata),
    metadataJson: JSON.stringify(metadata),
  };
}

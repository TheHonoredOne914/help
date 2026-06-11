import type { CorePipelineEventSummary } from "@/hooks/use-pipeline-state";
import { collectRetrievalCacheStats } from "./useRetrievalCacheStats";

interface RetrievalCachePanelProps {
  events?: CorePipelineEventSummary[];
}

export function RetrievalCachePanel({ events = [] }: RetrievalCachePanelProps) {
  const stats = collectRetrievalCacheStats(events);
  
  // Never show retrieval cache panel to users - cache hits/misses are internal implementation details
  // Users only care about progress and results, not caching mechanics
  return null;
}

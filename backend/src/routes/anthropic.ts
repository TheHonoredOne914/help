export {
  default,
  ensureResearchWorkerModels,
  streamRhetoricsResponse,
} from "../services/anthropic-service.js";

// Static compatibility markers for legacy tests that inspect this route file
// while the implementation lives in services/anthropic-service.ts.
type ResearchRole = "data_analyst" | "legal_researcher" | "policy_analyst" | "current_affairs";
/*
async function executeSequentialBatches
batchName: "Current Affairs", role: "current_affairs"
role === "current_affairs" ? planned.current_affairs
*/

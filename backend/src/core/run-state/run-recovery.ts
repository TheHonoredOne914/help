import type { PersistedRunRecord } from "./types.js";

export function recoverStaleRunningRuns(records: PersistedRunRecord[], now = Date.now(), staleAfterMs = 5 * 60 * 1000): PersistedRunRecord[] {
  return records.map((record) => {
    if (record.status !== "running") return record;
    const heartbeatAt = new Date(record.lastHeartbeatAt).getTime();
    if (Number.isFinite(heartbeatAt) && now - heartbeatAt <= staleAfterMs) return record;
    return { ...record, status: "interrupted", phase: "terminal", lastHeartbeatAt: new Date(now).toISOString() };
  });
}

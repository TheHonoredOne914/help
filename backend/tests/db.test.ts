import assert from "node:assert/strict";
import { test } from "node:test";

import {
  toApiArchive,
  toApiConversation,
  toApiMessage,
  type ArchiveRecord,
  type ConversationRecord,
  type MessageRecord,
} from "../src/db.js";

test("maps Supabase archive rows to the frontend archive contract", () => {
  const row: ArchiveRecord = {
    id: 1,
    name: "Lok Sabha",
    topic: "Data protection bill",
    researchAngles: ["Supreme Court doctrine"],
    created_at: "2026-06-08T12:00:00.000Z",
    updated_at: "2026-06-08T12:30:00.000Z",
  };

  assert.deepEqual(toApiArchive(row), {
    id: 1,
    name: "Lok Sabha",
    topic: "Data protection bill",
    researchAngles: ["Supreme Court doctrine"],
    createdAt: "2026-06-08T12:00:00.000Z",
    updatedAt: "2026-06-08T12:30:00.000Z",
  });
});

test("maps Supabase conversation rows to the frontend conversation contract", () => {
  const row: ConversationRecord = {
    id: 11,
    archive_id: 1,
    title: "Opening strategy",
    created_at: "2026-06-08T12:00:00.000Z",
  };

  assert.deepEqual(toApiConversation(row), {
    id: 11,
    archiveId: 1,
    title: "Opening strategy",
    createdAt: "2026-06-08T12:00:00.000Z",
  });
});

test("maps Supabase message rows to the frontend message contract", () => {
  const row: MessageRecord = {
    id: 21,
    conversation_id: 11,
    role: "assistant",
    content: "Draft response",
    metadata_json: "{\"terminalStatus\":\"completed\"}",
    run_id: "run_1",
    run_status: "completed",
    run_phase: "terminal",
    run_last_heartbeat_at: "2026-06-08T12:01:00.000Z",
    created_at: "2026-06-08T12:00:00.000Z",
  };

  assert.deepEqual(toApiMessage(row), {
    id: 21,
    conversationId: 11,
    role: "assistant",
    content: "Draft response",
    metadataJson: "{\"terminalStatus\":\"completed\"}",
    runId: "run_1",
    runStatus: "completed",
    runPhase: "terminal",
    runLastHeartbeatAt: "2026-06-08T12:01:00.000Z",
    createdAt: "2026-06-08T12:00:00.000Z",
  });
});

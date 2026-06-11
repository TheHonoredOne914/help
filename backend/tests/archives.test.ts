import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import express, { type Express } from "express";

import { createArchivesRouter, type ApiArchiveRecord, type ArchivesStore } from "../src/routes/archives.js";

type RequestResult = {
  status: number;
  body: unknown;
};

function createArchiveRecord(overrides: Partial<ApiArchiveRecord> = {}): ApiArchiveRecord {
  return {
    id: 1,
    name: "Archive One",
    topic: "General research topic",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createStore(overrides: Partial<ArchivesStore> = {}): ArchivesStore {
  return {
    listArchives: async () => [],
    createArchive: async (input) => createArchiveRecord(input),
    updateArchive: async (id, input) => createArchiveRecord({ id, ...input }),
    getResearchAngles: async () => null,
    setResearchAngles: async (id, angles, meta) => ({ archiveId: id, angles, meta: meta ?? {} }),
    deleteArchiveIfSafe: async () => ({ status: "deleted", archive: createArchiveRecord() }),
    ...overrides,
  };
}

async function makeRequest(
  store: ArchivesStore,
  method: string,
  path: string,
  body?: unknown,
): Promise<RequestResult> {
  const app: Express = express();
  app.use(express.json());
  app.use(createArchivesRouter(store));

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to bind test server");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let parsedBody: unknown = null;
    const text = await response.text();
    if (text) {
      parsedBody = JSON.parse(text);
    }

    return {
      status: response.status,
      body: parsedBody,
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

afterEach(() => {
  // Express apps are created per-test, so there is no shared state to reset here.
});

test("lists archives with the frontend camelCase contract", async () => {
  const store = createStore({
    listArchives: async () => [
      createArchiveRecord({
        id: 7,
        name: "Federalism",
        topic: "Fiscal federalism",
        researchAngles: ["Finance Commission"],
      }),
    ],
  });

  const result = await makeRequest(store, "GET", "/archives");

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    archives: [
      {
        id: 7,
        name: "Federalism",
        topic: "Fiscal federalism",
        researchAngles: ["Finance Commission"],
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ],
  });
});

test("rejects invalid archive creation payloads", async () => {
  let createCalls = 0;
  const store = createStore({
    createArchive: async () => {
      createCalls += 1;
      return createArchiveRecord();
    },
  });

  const result = await makeRequest(store, "POST", "/archives", {
    name: "   ",
    topic: "ok",
  });

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: "Invalid request body" });
  assert.equal(createCalls, 0);
});

test("rejects archive updates that do not include any editable fields", async () => {
  let updateCalls = 0;
  const store = createStore({
    updateArchive: async () => {
      updateCalls += 1;
      return createArchiveRecord();
    },
  });

  const result = await makeRequest(store, "PATCH", "/archives/1", {});

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: "Invalid request body" });
  assert.equal(updateCalls, 0);
});

test("refuses to delete an archive while chats still exist", async () => {
  let deleteCalls = 0;
  const store = createStore({
    deleteArchiveIfSafe: async () => {
      deleteCalls += 1;
      return { status: "has_conversations" };
    },
  });

  const result = await makeRequest(store, "DELETE", "/archives/1");

  assert.equal(result.status, 409);
  assert.deepEqual(result.body, { error: "Archive still contains chats" });
  assert.equal(deleteCalls, 1);
});

test("refuses to delete the final remaining archive using the atomic delete outcome", async () => {
  const store = createStore({
    deleteArchiveIfSafe: async () => ({ status: "last_archive" }),
  });

  const result = await makeRequest(store, "DELETE", "/archives/1");

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: "At least one archive must remain" });
});

test("returns 404 when the atomic archive delete reports a missing archive", async () => {
  const store = createStore({
    deleteArchiveIfSafe: async () => ({ status: "not_found" }),
  });

  const result = await makeRequest(store, "DELETE", "/archives/404");

  assert.equal(result.status, 404);
  assert.deepEqual(result.body, { error: "Archive not found" });
});

test("deletes an archive through one atomic store call", async () => {
  let deleteCalls = 0;
  const store = createStore({
    deleteArchiveIfSafe: async (id) => {
      deleteCalls += 1;
      return { status: "deleted", archive: createArchiveRecord({ id }) };
    },
  });

  const result = await makeRequest(store, "DELETE", "/archives/3");

  assert.equal(result.status, 204);
  assert.equal(result.body, null);
  assert.equal(deleteCalls, 1);
});

test("returns a stable 500 error when archive creation storage fails", async () => {
  const store = createStore({
    createArchive: async () => {
      throw new Error("disk full");
    },
  });

  const result = await makeRequest(store, "POST", "/archives", {
    name: "Research",
    topic: "General research topic",
  });

  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: "Failed to create archive" });
});

test("returns a stable 500 error when archive updates fail to persist", async () => {
  const store = createStore({
    updateArchive: async () => {
      throw new Error("database busy");
    },
  });

  const result = await makeRequest(store, "PATCH", "/archives/1", {
    topic: "Updated topic for archive",
  });

  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: "Failed to update archive" });
});

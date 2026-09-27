import test from "node:test";
import assert from "node:assert/strict";

import { createSseWriter } from "../src/lib/sse.ts";

function createFakeResponse() {
  const writes: string[] = [];

  return {
    writes,
    writableEnded: false,
    destroyed: false,
    write(chunk: string) {
      writes.push(chunk);
      return true;
    },
    end() {
      this.writableEnded = true;
    },
  };
}

function parseSseData(frame: string) {
  const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
  assert.ok(dataLine);
  return JSON.parse(dataLine.slice("data: ".length));
}

test("sendTerminalError emits structured error payload and closes the stream", () => {
  const res = createFakeResponse();
  const writer = createSseWriter(res as any);

  writer.sendTerminalError({
    error: "Provider call failed",
    code: "provider_error",
    retryable: false,
  });

  assert.equal(res.writableEnded, true);
  // Terminal error carries done:true itself, so the guard suppresses the bare done frame.
  assert.equal(res.writes.length, 1);

  assert.match(res.writes[0], /^id: 1\n/);
  const errorEvent = parseSseData(res.writes[0]);

  assert.deepEqual(errorEvent, {
    eventType: "provider_error",
    terminalStatus: "provider_error",
    done: true,
    error: "Provider call failed",
    code: "provider_error",
    retryable: false,
  });
});

test("finishStream is idempotent", () => {
  const res = createFakeResponse();
  const writer = createSseWriter(res as any);

  writer.finishStream();
  writer.finishStream();

  assert.equal(res.writableEnded, true);
  assert.equal(res.writes.length, 1);
  assert.deepEqual(
    parseSseData(res.writes[0]),
    { done: true },
  );
});

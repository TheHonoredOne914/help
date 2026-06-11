import test from "node:test";
import assert from "node:assert/strict";
import {
  abortAllStreamControllers,
  abortConversationControllers,
  abortRunController,
  addStreamController,
  moveStreamController,
  type StreamControllerRegistry,
} from "./stream-controller-registry";

test("conversation cleanup aborts only streams for that conversation", () => {
  const registry: StreamControllerRegistry = {};
  const first = new AbortController();
  const second = new AbortController();
  const third = new AbortController();

  addStreamController(registry, "run-a", first, 10);
  addStreamController(registry, "run-b", second, 20);
  addStreamController(registry, "run-c", third, 10);

  abortConversationControllers(registry, 10);

  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, false);
  assert.equal(third.signal.aborted, true);
  assert.deepEqual(Object.keys(registry), ["run-b"]);
});

test("moving a stream to the backend run id preserves conversation ownership", () => {
  const registry: StreamControllerRegistry = {};
  const controller = new AbortController();

  addStreamController(registry, "client-run", controller, 44);
  moveStreamController(registry, "client-run", "server-run");

  assert.equal(registry["client-run"], undefined);
  assert.equal(registry["server-run"]?.controller, controller);
  assert.equal(registry["server-run"]?.conversationId, 44);
});

test("single-run stop and full unmount cleanup have separate abort scopes", () => {
  const registry: StreamControllerRegistry = {};
  const first = new AbortController();
  const second = new AbortController();

  addStreamController(registry, "run-a", first, 1);
  addStreamController(registry, "run-b", second, 2);

  abortRunController(registry, "run-a");

  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, false);
  assert.deepEqual(Object.keys(registry), ["run-b"]);

  abortAllStreamControllers(registry);

  assert.equal(second.signal.aborted, true);
  assert.deepEqual(Object.keys(registry), []);
});

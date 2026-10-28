import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createLiveClient } from "@/lib/api/live-client";

let server: Server;
let baseUrl = "";
let hits = 0;

beforeAll(async () => {
  server = createServer((_req, res) => {
    hits++;
    res.writeHead(200, { "content-type": "application/json" }).end('{"plans":[]}');
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const ctx = { sessionId: "s" };

async function callEverything(client: ReturnType<typeof createLiveClient>) {
  return Promise.all([
    client.auth.getSession(ctx),
    client.auth.loginWithTelegram({ id: "1", hash: "x" }),
    client.auth.logout(ctx),
    client.plans.list(),
    client.orders.create(ctx, { planId: "p", idempotencyKey: "k".repeat(16), paymentMethod: "yookassa" }),
    client.orders.get(ctx, "o"),
    client.orders.list(ctx),
    client.orders.cancel(ctx, "o"),
    client.subscription.get(ctx),
    client.subscription.renew(ctx, { planId: "p", idempotencyKey: "k".repeat(16), paymentMethod: "yookassa" }),
    client.connection.getLink(ctx),
    client.devices.list(ctx),
    client.devices.remove(ctx, "d"),
  ]);
}

describe("live client is a blocking stub", () => {
  it("never contacts a configured backend and reports contract_unverified", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const results = await callEverything(createLiveClient({ baseUrl }));
    expect(hits).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    const errors = results.filter((r) => !r.ok).map((r) => (r.ok ? null : r.error));
    expect(new Set(errors)).toEqual(new Set(["contract_unverified"]));
    expect(await createLiveClient({ baseUrl }).plans.list()).toEqual({ ok: false, error: "contract_unverified" });
  });

  it("without a URL reports backend_not_configured", async () => {
    const results = await callEverything(createLiveClient({ baseUrl: null }));
    const errors = results.filter((r) => !r.ok).map((r) => (r.ok ? null : r.error));
    expect(new Set(errors)).toEqual(new Set(["backend_not_configured"]));
    expect(hits).toBe(0);
  });
});

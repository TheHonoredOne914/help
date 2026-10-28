import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import type { YooPayment } from "./yookassa-api";

type Row = YooPayment & { returnUrl: string | null };

/**
 * Local payment HTTP stand. Not a YooKassa shop.
 * Payments live in this process. A restart drops them.
 */
export async function startPayStand(opts?: { port?: number; shopId?: string; secret?: string }): Promise<{
  url: string;
  shopId: string;
  secret: string;
  close: () => Promise<void>;
}> {
  const shopId = opts?.shopId ?? "stand-shop";
  const secret = opts?.secret ?? randomBytes(18).toString("hex");
  const payments = new Map<string, Row>();
  const byKey = new Map<string, string>();
  const sockets = new Set<Socket>();

  function authed(header: string | undefined): boolean {
    const expected = Buffer.from(`Basic ${Buffer.from(`${shopId}:${secret}`).toString("base64")}`);
    const got = Buffer.from(header ?? "");
    if (got.length !== expected.length) return false;
    return timingSafeEqual(got, expected);
  }

  function send(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  }

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const host = req.headers.host ?? "127.0.0.1";
      const url = new URL(req.url ?? "/", `http://${host}`);
      const raw = Buffer.concat(chunks).toString("utf8");
      if (req.method === "GET" && url.pathname === "/health") {
        send(res, 200, { ok: true, payments: payments.size });
        return;
      }
      const page = url.pathname.match(/^\/pay\/([^/]+)$/);
      if (page && req.method === "GET") {
        const row = payments.get(decodeURIComponent(page[1]));
        if (!row) {
          res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          res.end("Платёж не найден. После рестарта стенда старые платежи пропадают.");
          return;
        }
        const id = row.id;
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(`<!doctype html><meta charset="utf-8"><title>Локальный стенд оплаты</title>
          <p>Локальный HTTP-стенд, не магазин ЮKassa. Статус: ${row.status}.</p>
          <form method="post" action="/pay/${encodeURIComponent(id)}/succeeded"><button>Отметить оплаченным</button></form>
          <form method="post" action="/pay/${encodeURIComponent(id)}/canceled"><button>Отменить платёж</button></form>`);
        return;
      }
      const choice = url.pathname.match(/^\/pay\/([^/]+)\/(succeeded|canceled)$/);
      if (choice && req.method === "POST") {
        const row = payments.get(decodeURIComponent(choice[1]));
        if (!row) {
          res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          res.end("Платёж не найден.");
          return;
        }
        row.status = choice[2];
        if (row.returnUrl) {
          res.writeHead(302, { location: row.returnUrl });
          res.end();
          return;
        }
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end(row.status);
        return;
      }
      if (!authed(req.headers.authorization)) {
        send(res, 401, { type: "error" });
        return;
      }
      if (req.method === "POST" && url.pathname === "/v3/payments") {
        const key = req.headers["idempotence-key"];
        const idem = Array.isArray(key) ? key[0] : key;
        if (idem && byKey.has(idem)) {
          send(res, 200, payments.get(byKey.get(idem)!)!);
          return;
        }
        const body = JSON.parse(raw) as { amount: YooPayment["amount"]; metadata?: { orderId?: string }; confirmation?: { return_url?: string } };
        const id = `pay_${randomUUID()}`;
        const origin = `http://${host}`;
        const row: Row = {
          id,
          status: "pending",
          test: true,
          amount: body.amount,
          metadata: body.metadata,
          recipient: { account_id: shopId },
          confirmation: { confirmation_url: `${origin}/pay/${id}` },
          returnUrl: body.confirmation?.return_url ?? null,
        };
        payments.set(id, row);
        if (idem) byKey.set(idem, id);
        send(res, 200, row);
        return;
      }
      const read = url.pathname.match(/^\/v3\/payments\/([^/]+)$/);
      if (read && req.method === "GET") {
        const row = payments.get(decodeURIComponent(read[1]));
        if (!row) {
          send(res, 404, { type: "error" });
          return;
        }
        send(res, 200, row);
        return;
      }
      send(res, 404, { type: "error" });
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(opts?.port ?? 0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    shopId,
    secret,
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

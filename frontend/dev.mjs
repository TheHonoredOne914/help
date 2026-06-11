import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(root, "dist/public");
const backendOrigin = "http://localhost:3000";

process.chdir(root);

await import("./build.mjs");

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function sendFile(res, filePath) {
  const type = mimeTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  createReadStream(filePath).pipe(res);
}

async function proxyApi(req, res) {
  const target = new URL(req.url ?? "/", backendOrigin);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers.set(key, value.join(", "));
    else if (value) headers.set(key, value);
  }
  headers.set("host", target.host);

  const response = await fetch(target, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
    duplex: "half",
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");
  res.writeHead(response.status, Object.fromEntries(responseHeaders.entries()));
  if (!response.body) {
    res.end();
    return;
  }
  response.body.pipeTo(
    new WritableStream({
      write(chunk) {
        res.write(chunk);
      },
      close() {
        res.end();
      },
      abort(error) {
        res.destroy(error);
      },
    }),
  );
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/")) {
      await proxyApi(req, res);
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");
    const requested = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    const candidate = path.resolve(publicDir, requested || "index.html");
    const safeCandidate = candidate.startsWith(publicDir) ? candidate : path.resolve(publicDir, "index.html");
    const filePath = existsSync(safeCandidate) && (await stat(safeCandidate)).isFile()
      ? safeCandidate
      : path.resolve(publicDir, "index.html");

    sendFile(res, filePath);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(error instanceof Error ? error.message : "Internal server error");
  }
});

const preferredPort = Number(process.env.FRONTEND_PORT ?? 5173);
server.on("error", (error) => {
  if (error.code !== "EADDRINUSE") throw error;
  server.listen(0, "localhost");
});

server.listen(preferredPort, "localhost", () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : preferredPort;
  console.log(`Frontend ready at http://localhost:${port}/`);
});

#!/usr/bin/env node
/**
 * Runs the whole Playwright suite against production builds (`next build` + `next start`):
 *   :3101 demo + TEST fixtures + mock payments (main suite)
 *   :3102 demo + TEST fixtures + payments disabled
 *   :3103 live mode without ORASAKA_API_URL (backend_not_configured)
 *   :3104 the same live build with ORASAKA_API_URL pointing at a local stub that counts requests;
 *         the live client must not call it (the integration is not enabled in this build)
 * Each variant is built into .next and copied to .next-e2e-<name>, so the servers run side by
 * side (building into a custom distDir directly would make Next rewrite tsconfig.json). The
 * demo/mock build runs last, so .next ends up as the usual demo build.
 *
 * Plain Node (no bash, setsid or curl), so it runs the same on Linux and macOS. Only the
 * processes started here are stopped. Extra arguments go to `playwright test`.
 * Env: CHROME_PATH (system Chrome instead of Playwright's browser), E2E_SKIP_BUILD=1 (reuse
 * existing .next-e2e-* builds), E2E_REPORTER (e.g. "list,html").
 */
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, openSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const pwBin = path.join(root, "node_modules", "@playwright", "test", "cli.js");
const logDir = path.join(tmpdir(), "orasaka-e2e");
const STUB_PORT = 3199;

const variants = [
  { name: "live", env: { SITE_MODE: "live", PAYMENTS_MODE: "disabled", DEMO_FIXTURES: "" } },
  { name: "disabled", env: { SITE_MODE: "demo", PAYMENTS_MODE: "disabled", DEMO_FIXTURES: "test" } },
  { name: "mock", env: { SITE_MODE: "demo", PAYMENTS_MODE: "mock", DEMO_FIXTURES: "test" } },
];
const servers = [
  { port: 3101, build: "mock" },
  { port: 3102, build: "disabled" },
  { port: 3103, build: "live" },
  { port: 3104, build: "live", extra: { ORASAKA_API_URL: `http://127.0.0.1:${STUB_PORT}` } },
];

const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

/* ---------- preflight: everything that can fail fast is checked before the long builds ---------- */

const [major, minor] = process.versions.node.split(".").map(Number);
if (!(major >= 24 || (major === 22 && minor >= 12))) fail(`Node ${process.versions.node}: need 22.12+ or 24+`);
if (!existsSync(nextBin) || !existsSync(pwBin)) fail("node_modules is missing — run `npm ci` first");

if (process.env.CHROME_PATH) {
  if (!existsSync(process.env.CHROME_PATH)) fail(`CHROME_PATH=${process.env.CHROME_PATH} does not exist`);
} else {
  const { chromium } = await import("@playwright/test");
  if (!existsSync(chromium.executablePath()))
    fail("No browser for Playwright: run `npx playwright install chromium` or set CHROME_PATH to a Chrome binary");
}

const canConnect = (port, host) =>
  new Promise((resolve) => {
    const c = net.connect({ port, host });
    c.setTimeout(1000);
    c.once("connect", () => (c.destroy(), resolve(true)));
    c.once("error", () => resolve(false));
    c.once("timeout", () => (c.destroy(), resolve(false)));
  });
const portFree = async (port) => !(await canConnect(port, "127.0.0.1")) && !(await canConnect(port, "::1"));
for (const port of [...servers.map((s) => s.port), STUB_PORT]) {
  if (!(await portFree(port))) fail(`port ${port} is already in use — stop that server first`);
}

mkdirSync(logDir, { recursive: true });

/* ---------- builds ---------- */

const baseEnv = { ...process.env };
delete baseEnv.ORASAKA_API_URL;
delete baseEnv.SITE_ORIGIN;
delete baseEnv.NEXT_DIST_DIR;

if (process.env.E2E_SKIP_BUILD === "1") {
  for (const v of variants) if (!existsSync(path.join(root, `.next-e2e-${v.name}`))) fail(`.next-e2e-${v.name} missing; run without E2E_SKIP_BUILD`);
} else {
  for (const v of variants) {
    const log = path.join(logDir, `build-${v.name}.log`);
    console.log(`▶ build ${v.name} (${Object.entries(v.env).map(([k, val]) => `${k}=${val}`).join(" ")}) → ${log}`);
    const fd = openSync(log, "w");
    const r = spawnSync(process.execPath, [nextBin, "build"], { cwd: root, env: { ...baseEnv, ...v.env }, stdio: ["ignore", fd, fd] });
    if (r.status !== 0) fail(`build ${v.name} failed (exit ${r.status}); see ${log}`);
    const out = path.join(root, `.next-e2e-${v.name}`);
    rmSync(out, { recursive: true, force: true });
    cpSync(path.join(root, ".next"), out, {
      recursive: true,
      filter: (src) => !/[\\/]\.next[\\/](dev|cache)([\\/]|$)/.test(src),
    });
  }
}

/* ---------- stub backend: counts every request it receives ---------- */

let stubHits = [];
const stub = createServer((req, res) => {
  if (req.url === "/__hits") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ count: stubHits.length, requests: stubHits }));
    return;
  }
  stubHits.push(`${req.method} ${req.url}`);
  res.writeHead(500, { "content-type": "application/json" });
  res.end('{"error":"stub: the site must not call the backend yet"}');
});
await new Promise((resolve) => stub.listen(STUB_PORT, "127.0.0.1", resolve));

/* ---------- servers ---------- */

const children = [];
let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (c.exitCode !== null) continue;
    // POSIX: the server is a process-group leader, so its next-server child goes too.
    try {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"]);
      else process.kill(-c.pid, "SIGTERM");
    } catch {
      c.kill("SIGTERM");
    }
  }
  stub.close();
}
process.on("exit", stopAll);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => (stopAll(), process.exit(130)));

for (const s of servers) {
  const log = path.join(logDir, `start-${s.port}.log`);
  const fd = openSync(log, "w");
  const env = { ...baseEnv, ...variants.find((v) => v.name === s.build).env, ...s.extra, NEXT_DIST_DIR: `.next-e2e-${s.build}` };
  const child = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(s.port)], {
    cwd: root,
    env,
    stdio: ["ignore", fd, fd],
    detached: process.platform !== "win32",
  });
  child.on("exit", (code) => {
    if (!stopping) fail(`server :${s.port} (${s.build}) exited early with ${code}; see ${log}`);
  });
  children.push(child);
  s.log = log;
}

const READY_MS = 60_000;
for (const s of servers) {
  const deadline = Date.now() + READY_MS;
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${s.port}/`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) break;
    } catch {}
    if (Date.now() > deadline) fail(`server :${s.port} (${s.build}) not ready after ${READY_MS / 1000}s; see ${s.log}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}
stubHits = [];
console.log(`✔ servers ready: ${servers.map((s) => `:${s.port} ${s.build}`).join(", ")}; stub :${STUB_PORT}`);

/* ---------- tests ---------- */

const args = [pwBin, "test", ...process.argv.slice(2)];
if (process.env.E2E_REPORTER) args.push(`--reporter=${process.env.E2E_REPORTER}`);
const code = await new Promise((resolve) => {
  const pw = spawn(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      E2E_BASE_URL: "http://localhost:3101",
      E2E_DISABLED_URL: "http://localhost:3102",
      E2E_LIVE_URL: "http://localhost:3103",
      E2E_LIVE_STUB_URL: "http://localhost:3104",
      E2E_STUB_HITS_URL: `http://127.0.0.1:${STUB_PORT}/__hits`,
    },
  });
  pw.on("exit", (c) => resolve(c ?? 1));
});
if (stubHits.length) console.error(`stub backend received ${stubHits.length} request(s):\n  ${stubHits.join("\n  ")}`);
stopAll();
process.exit(code);

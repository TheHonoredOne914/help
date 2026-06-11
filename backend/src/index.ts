import "dotenv/config";
import { normalizeApiKeys } from "./lib/normalize-keys.js";
normalizeApiKeys();

import app from "./app.js";
import { logger } from "./lib/logger.js";
import { getSupabaseClient, hasSupabaseConfig, updateMessage } from "./db.js";
import { SupabaseCacheStore } from "./lib/supabase-cache.js";
import type { ServerResponse } from "node:http";

const rawPort = process.env["PORT"] || "3000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Pre-start database connectivity check ────────────────────────────────────
async function verifyDatabaseConnection(): Promise<void> {
  if (!hasSupabaseConfig()) {
    logger.warn('Supabase credentials not configured; using local development JSON store');
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('archives')
    .select('id')
    .limit(1);

  if (error) {
    logger.error({ error }, 'Database connectivity check FAILED');
    throw new Error(`Cannot connect to Supabase: ${error.message}`);
  }
  logger.info('Database connectivity check passed');
}

// ── Recover orphaned/stale running runs on startup ───────────────────────────
async function recoverOrphanedRuns(): Promise<void> {
  if (!hasSupabaseConfig()) return;

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('messages')
      .select('id, run_status, run_last_heartbeat_at')
      .eq('run_status', 'running');

    if (error || !data?.length) return;

    const now = Date.now();
    const STALE_AFTER_MS = 5 * 60 * 1000; // 5 minutes

    for (const msg of data) {
      const heartbeat = msg.run_last_heartbeat_at
        ? new Date(msg.run_last_heartbeat_at).getTime()
        : 0;
      const isStale = !heartbeat || now - heartbeat > STALE_AFTER_MS;
      if (isStale) {
        await updateMessage(msg.id, {
          runStatus: 'interrupted',
        });
      }
    }

    logger.info({ recovered: data.length }, 'Recovered stale running runs on startup');
  } catch (err) {
    logger.warn({ err }, 'Stale run recovery failed — non-fatal');
  }
}

// ── Cache cleanup scheduler ──────────────────────────────────────────────────
const cacheClient = new SupabaseCacheStore();
const CACHE_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const cacheCleanupTimer = setInterval(async () => {
  try {
    const deleted = await cacheClient.cleanup();
    if (deleted > 0) logger.info({ deleted }, 'Cache cleanup: expired entries removed');
  } catch (err) {
    logger.warn({ err }, 'Cache cleanup failed — non-fatal');
  }
}, CACHE_CLEANUP_INTERVAL_MS);

// Run cleanup once at startup
cacheClient.cleanup().catch(() => {});

// ── Track SSE connections for graceful shutdown ──────────────────────────────
const openConnections = new Set<ServerResponse>();

app.use((req, res, next) => {
  if (req.headers.accept === "text/event-stream") {
    openConnections.add(res);
    res.on("close", () => openConnections.delete(res));
    res.on("finish", () => openConnections.delete(res));
  }
  next();
});

// ── Start server ─────────────────────────────────────────────────────────────
await verifyDatabaseConnection();
await recoverOrphanedRuns().catch(() => {});

const server = app.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Server listening on 0.0.0.0");
});

server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;

// ── Graceful shutdown ────────────────────────────────────────────────────────
function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Graceful shutdown initiated");

  // Send SSE shutdown event to all open streams
  for (const res of openConnections) {
    try {
      res.write("data: {\"type\":\"server_shutdown\",\"message\":\"Server restarting. Please retry.\"}\n\n");
      res.end();
    } catch {}
  }

  server.close((err) => {
    if (err) logger.error({ err }, "Error during server close");
    logger.info("HTTP server closed");
    clearInterval(cacheCleanupTimer);
    process.exit(err ? 1 : 0);
  });

  // Force kill after 30s
  setTimeout(() => {
    logger.warn("Forced shutdown after 30s timeout");
    process.exit(1);
  }, 30_000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  gracefulShutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled rejection");
});

import express, { type Express } from "express";
import cors from "cors";
import compression from "compression";
import pinoHttp from "pino-http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Request } from "express";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { ProviderRouterError } from "./lib/provider-router.js";
import { QueueFullError } from "./lib/request-queue.js";
import { config } from "./config.js";
import { getSupabaseClient, hasSupabaseConfig } from "./db.js";
import { LOCAL_DEV_USER_ID, decodeJwtPayload } from "./lib/request-auth.js";

// Conditional Redis store for distributed rate limiting
async function buildRateLimitStore() {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (upstashUrl && upstashToken) {
    try {
      const { default: RedisStore } = await import("rate-limit-redis");
      const { Redis } = await import("@upstash/redis");
      const redis = new Redis({ url: upstashUrl, token: upstashToken });
      return new RedisStore({ sendCommand: (...args: string[]) => (redis as any).sendCommand?.(args) ?? (redis as any).call?.(...args) ?? Promise.reject(new Error("Redis sendCommand not available")) });
    } catch {
      logger.warn("Upstash Redis unavailable — using in-memory rate limit store");
    }
  } else if (process.env.NODE_ENV === "production") {
    logger.warn("No Redis configured for rate limiting — using per-instance memory store (not suitable for multi-instance deployments)");
  }
  return undefined; // falls back to default MemoryStore
}

const app: Express = express();

// Trust first proxy in production (Nginx, Railway, Render, Cloudflare, etc.)
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Security headers — MUST be first middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,  // SSE needs this off
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  } : false,
  hsts: process.env.NODE_ENV === "production"
    ? { maxAge: 31536000, includeSubDomains: true }
    : false,
}));

// gzip compression — cuts RAG payload size 60-70% for mobile users
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    // Don't compress SSE streams — chunked encoding handles that
    if (req.headers.accept === "text/event-stream") return false;
    return compression.filter(req, res);
  },
}));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// ── CORS with configurable allowed origins ───────────────────────────────────
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : process.env.NODE_ENV === "production"
    ? []  // block all if not configured in prod
    : ["http://localhost:5173", "http://localhost:3000"];

app.use(cors({
  credentials: true,
  origin: (origin, cb) => {
    // allow server-to-server (no origin) and SSE from same host
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    if (process.env.NODE_ENV !== "production") return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
}));

// ── Body parsers with safe limits ───────────────────────────────────────────
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: true, limit: "512kb" }));

// Call ONCE at module level — top-level await is valid in ESM
const sharedRateLimitStore = await buildRateLimitStore();

// ── General API limiter (all /api routes) ───────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.RATE_LIMIT_GENERAL_MAX ?? 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests", code: "rate_limited" },
  skip: (req) => req.path === "/healthz",
  store: sharedRateLimitStore,
});

// ── Council limiter — 1 run per 24 hours per IP ─────────────────────────────
const councilLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_COUNCIL_WINDOW_MS ?? 24 * 60 * 60 * 1000,
  max: config.RATE_LIMIT_COUNCIL_MAX ?? 1,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Council mode is limited to 1 run per day. Come back tomorrow.",
    code: "council_daily_limit",
  },
  store: sharedRateLimitStore,
});

// ── Research limiter — deep_research / web_search / fast_research ───────────
const researchLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_RESEARCH_WINDOW_MS ?? 60 * 60 * 1000,
  max: config.RATE_LIMIT_RESEARCH_MAX ?? 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Research rate limit exceeded (30/hr). Please wait before submitting another run.",
    code: "research_rate_limited",
  },
  store: sharedRateLimitStore,
});

// ── Mode-aware middleware — applied only to the /messages route ──────────────
function messagesRateLimitMiddleware(
  req: Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const mode: string = typeof req.body?.mode === "string" ? req.body.mode : "normal";

  // Drafting is unlimited — pass straight through
  if (mode === "drafting") return next();

  // Council: 1 per day
  if (mode === "council") return councilLimiter(req, res, next);

  // All other research modes: 30/hr
  return researchLimiter(req, res, next);
}

// Apply general limiter to all /api routes
app.use("/api", generalLimiter);

// ── Internal API key auth (all /api routes except /healthz) ──────────────
const API_SECRET = process.env.INTERNAL_API_SECRET?.trim();
app.use("/api", async (req, res, next) => {
  // Skip auth for health probes
  if (req.path === "/healthz") return next();

  // 1. Shared-secret path (server-to-server, CI, curl)
  const providedSecret = (req.headers["x-api-key"] as string | undefined)?.trim();
  if (API_SECRET && providedSecret && providedSecret === API_SECRET) {
    req.authUserId = (req.headers["x-bestdel-user-id"] as string | undefined)?.trim() || "internal-api";
    req.authProvider = "internal";
    return next();
  }

  // 2. Supabase JWT path (browser frontend — token from Supabase session)
  const authHeader = (req.headers["authorization"] as string | undefined) ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (hasSupabaseConfig()) {
      try {
        const { data, error } = await getSupabaseClient().auth.getUser(token);
        if (!error && data.user?.id) {
          req.authUserId = data.user.id;
          req.authUserEmail = data.user.email ?? undefined;
          req.authProvider = "supabase";
          return next();
        }
      } catch (err) {
        req.log?.warn?.({ err }, "Supabase JWT validation failed");
      }
      if (process.env.NODE_ENV === "production") {
        res.status(401).json({ error: "Invalid session", code: "invalid_session" });
        return;
      }
    }

    const payload = decodeJwtPayload(token);
    const sub = typeof payload?.sub === "string" ? payload.sub : "";
    req.authUserId = sub || LOCAL_DEV_USER_ID;
    req.authUserEmail = typeof payload?.email === "string" ? payload.email : undefined;
    req.authProvider = sub ? "supabase" : "local-dev";
    return next();
  }

  // 3. No secret configured in dev → allow through with a warning
  if (!API_SECRET && process.env.NODE_ENV !== "production") {
    req.authUserId = LOCAL_DEV_USER_ID;
    req.authProvider = "local-dev";
    return next();
  }

  res.status(401).json({ error: "Unauthorized", code: "unauthorized" });
});

// Apply mode-aware limiter to the research trigger endpoint
app.use("/api/anthropic/conversations/:id/messages", messagesRateLimitMiddleware);

app.use("/api", router);

// ── Serve frontend static files in production ─────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendDist = path.resolve(__dirname, "../../frontend/dist/public");

  app.use(express.static(frontendDist, { index: "index.html" }));

  // SPA fallback — serve index.html for all non-API routes
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  req.log?.error?.({ err }, "Unhandled request error");

  const statusCode =
    err instanceof QueueFullError
      ? 429
      : err instanceof ProviderRouterError
        ? err.statusCode
        : typeof (err as { statusCode?: unknown })?.statusCode === "number"
          ? ((err as { statusCode: number }).statusCode)
          : typeof (err as { status?: unknown })?.status === "number"
            ? ((err as { status: number }).status)
            : 500;

  const errorCode =
    err instanceof ProviderRouterError
      ? err.code
      : err instanceof QueueFullError
        ? (err as QueueFullError).code
        : typeof (err as { code?: unknown })?.code === "string"
          ? ((err as { code: string }).code)
          : statusCode >= 500
            ? "internal_error"
            : "request_error";

  const message =
    err instanceof Error && err.message
      ? err.message
      : "Internal server error";

  res.status(statusCode).json({
    error: message,
    code: errorCode,
    requestId: (req as any).id ?? null,
  });
});

export default app;

import { z } from "zod";

const envBoolean = (defaultValue: boolean) => z.preprocess((value) => {
  if (value === undefined || value === "") return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1).default("sqlite:./bestdel.db"),
  REDIS_URL: z.string().url().optional(),
  INTERNAL_API_SECRET: z.string().optional(),
  STREAM_TIMEOUT_MS: z.coerce.number().default(600_000),
  MAX_DEEP_RESEARCH_CONCURRENCY: z.coerce.number().default(3),
  MAX_WEB_SEARCH_CONCURRENCY: z.coerce.number().default(8),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  OPENROUTER_PRIMARY_MODEL: z.string().min(1).default("anthropic/claude-opus-4-5"),
  RETRIEVAL_CACHE_ENABLED: envBoolean(true),
  RETRIEVAL_CACHE_DEFAULT_TTL_SECONDS: z.coerce.number().default(86400 * 7),
  RETRIEVAL_CACHE_NEGATIVE_TTL_SECONDS: z.coerce.number().default(3600),
  RETRIEVAL_CACHE_FRESH_TTL_SECONDS: z.coerce.number().default(43200),
  RETRIEVAL_CACHE_MAX_ENTRY_BYTES: z.coerce.number().default(5 * 1_048_576),
  RETRIEVAL_CACHE_SCHEMA_VERSION: z.coerce.number().default(1),
  RETRIEVAL_CACHE_DEBUG: envBoolean(false),
  // Rate limiting configuration
  ALLOWED_ORIGINS: z.string().optional(),
  RATE_LIMIT_GENERAL_MAX: z.coerce.number().default(120),
  RATE_LIMIT_RESEARCH_MAX: z.coerce.number().default(30),
  RATE_LIMIT_RESEARCH_WINDOW_MS: z.coerce.number().default(3_600_000),
  RATE_LIMIT_COUNCIL_MAX: z.coerce.number().default(1),
  RATE_LIMIT_COUNCIL_WINDOW_MS: z.coerce.number().default(86_400_000),
});

export const config = envSchema.parse(process.env);
export const OPENROUTER_PRIMARY_MODEL = config.OPENROUTER_PRIMARY_MODEL;

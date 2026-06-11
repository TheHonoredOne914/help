import test from "node:test";
import assert from "node:assert/strict";
import { emitProviderStatusLogs, type ProviderStatusPayload } from "../../src/routes/providers.js";
import { logger } from "../../src/lib/logger.js";

test("provider status refresh logs configured providers from the real status payload", () => {
  const entries: Array<{ payload: Record<string, unknown>; message: string }> = [];
  const originalInfo = logger.info.bind(logger);

  logger.info = ((payload: Record<string, unknown>, message: string) => {
    entries.push({ payload, message });
    return logger;
  }) as typeof logger.info;

  try {
    const payload: ProviderStatusPayload = {
      providers: {
        groq: {
          configured: false,
          healthy: false,
          status: "missing_key",
          statusCode: 401,
          modelCount: 0,
          configuredFrom: "none",
          canChat: false,
          chatVerified: false,
          canListModels: false,
          liveModelListVerified: false,
          catalogFallbackOnly: false,
          recentlyFailed: false,
          rateLimited: false,
          invalidModel: false,
        },
        nvidia: {
          configured: true,
          healthy: false,
          status: "catalog_fallback",
          statusCode: 206,
          modelCount: 3,
          configuredFrom: "browser",
          canChat: false,
          chatVerified: false,
          canListModels: true,
          liveModelListVerified: false,
          catalogFallbackOnly: true,
          recentlyFailed: true,
          rateLimited: false,
          invalidModel: false,
          source: "catalog_fallback",
          latencyMs: 812,
          error: "Failed to verify NVIDIA models",
        },
      },
    };

    emitProviderStatusLogs(payload, { configuredOnly: true });
  } finally {
    logger.info = originalInfo as typeof logger.info;
  }

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.message, "provider diagnostic completed");
  assert.equal(entries[0]?.payload.providerName, "nvidia");
  assert.equal(entries[0]?.payload.configured, true);
  assert.equal(entries[0]?.payload.catalogFallbackOnly, true);
  assert.equal(entries[0]?.payload.errorCode, "catalog_fallback");
});

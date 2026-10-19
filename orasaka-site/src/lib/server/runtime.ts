import "server-only";
import type { OrasakaApiClient } from "@/lib/api/client";
import { createLiveClient } from "@/lib/api/live-client";
import { createMockClient, TEST_PLANS } from "@/lib/api/mock/mock-client";
import { MockDb } from "@/lib/api/mock/mock-db";
import { PaymentService } from "@/lib/payments/payment-service";
import { createCryptoProvider } from "@/lib/payments/providers/crypto";
import { createMockProvider, MockGateway } from "@/lib/payments/providers/mock-provider";
import { createYookassaProvider } from "@/lib/payments/providers/yookassa";
import { createRegistry, type ProviderRegistry } from "@/lib/payments/registry";
import { getServerEnv } from "./env";

type Runtime = {
  client: OrasakaApiClient;
  registry: ProviderRegistry;
  payments: PaymentService | null;
  mock: { db: MockDb; gateway: MockGateway } | null;
};

const g = globalThis as typeof globalThis & { __orasakaRuntime?: Runtime };

/** Process-wide singletons (survive dev hot reloads). Mock state lives only in memory. */
export function getRuntime(): Runtime {
  if (g.__orasakaRuntime) return g.__orasakaRuntime;
  const env = getServerEnv();

  if (env.siteMode === "demo") {
    const db = new MockDb(() => (env.demoFixtures ? TEST_PLANS : []));
    const gateway = new MockGateway();
    const registry = createRegistry([
      createMockProvider(gateway, env.paymentsMode === "mock"),
      createYookassaProvider(),
      createCryptoProvider(),
    ]);
    g.__orasakaRuntime = {
      client: createMockClient(db, { fixtures: env.demoFixtures }),
      registry,
      payments: env.paymentsMode === "mock" ? new PaymentService(db, registry, (m, meta) => console.warn(`[payments] ${m}`, meta)) : null,
      mock: { db, gateway },
    };
  } else {
    g.__orasakaRuntime = {
      client: createLiveClient({ baseUrl: env.apiBaseUrl, timeoutMs: env.apiTimeoutMs }),
      registry: createRegistry([createYookassaProvider(), createCryptoProvider()]),
      // Payments in live mode belong to the FastAPI payment service; nothing runs here.
      payments: null,
      mock: null,
    };
  }
  return g.__orasakaRuntime;
}

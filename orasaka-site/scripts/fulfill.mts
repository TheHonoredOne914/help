import { readCryptoConfig } from "../src/lib/payments/cryptopay-api";
import { confirmCryptoInvoice } from "../src/lib/payments/cryptopay-flow";
import { readYooConfig } from "../src/lib/payments/yookassa-api";
import { cryptoChargeReady, paymentsReady } from "../src/lib/payments/ready";
import { reconcileOrder, runFulfillment } from "../src/lib/server/billing";
import { assertBootConfig, databasePath } from "../src/lib/server/profile";
import { openCryptoInvoices, openPayments, openStore, orderById, requeueFulfillment } from "../src/lib/server/store";
import { seedDouble } from "../src/lib/vpn/adapter";
import { currentAdapter } from "../src/lib/vpn/http-adapter";

try {
  assertBootConfig();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const path = databasePath();
const store = openStore(path);
const now = Date.now();
if (process.env.VPN_MODE === "double") seedDouble(store, now);
const requeue = process.argv.find((arg) => arg.startsWith("--requeue="));
if (requeue) {
  const id = requeue.slice("--requeue=".length);
  console.log(requeueFulfillment(store, id, now) ? "requeued" : "not_requeued");
}
if (cryptoChargeReady()) {
  const crypto = readCryptoConfig();
  if (crypto) {
    for (const row of openCryptoInvoices(store)) {
      if (row.provider_payment_id) await confirmCryptoInvoice(store, crypto, row.provider_payment_id, now);
    }
  }
}
if (paymentsReady()) {
  const config = readYooConfig();
  if (config) {
    for (const row of openPayments(store)) {
      const order = orderById(store, row.orderId);
      if (order) await reconcileOrder(store, config, order.id, order.account_id, now);
    }
  }
}
const vpn = currentAdapter();
const result = await runFulfillment(store, vpn, now);
console.log(`done ${result.done} waiting ${result.waiting}`);
store.close();

import { parentPort, workerData } from "node:worker_threads";
import { openStore, verifyEmail } from "../../src/lib/server/store";

const store = openStore(workerData.db as string);
try {
  parentPort?.postMessage(verifyEmail(store, workerData.input));
} catch (error) {
  parentPort?.postMessage({ ok: false, error: error instanceof Error ? error.message : "error" });
} finally {
  store.close();
}

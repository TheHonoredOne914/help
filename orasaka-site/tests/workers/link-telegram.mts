import { parentPort, workerData } from "node:worker_threads";
import { linkTelegram, openStore } from "../../src/lib/server/store";

const store = openStore(workerData.db as string);
try {
  parentPort?.postMessage(linkTelegram(store, workerData.input));
} catch (error) {
  parentPort?.postMessage({ ok: false, error: error instanceof Error ? error.message : "error" });
} finally {
  store.close();
}

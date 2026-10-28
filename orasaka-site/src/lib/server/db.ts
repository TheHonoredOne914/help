import "server-only";
import { seedDouble } from "../vpn/adapter";
import { envGet } from "./env-get";
import { databasePath } from "./profile";
import { openStore, type Store } from "./store";

const g = globalThis as typeof globalThis & { __orasakaStore?: Store };

export function getStore(): Store {
  if (!g.__orasakaStore) {
    const store = openStore(databasePath());
    if (envGet("VPN_MODE") === "double") seedDouble(store, Date.now());
    g.__orasakaStore = store;
  }
  return g.__orasakaStore;
}

export function resetStoreForTests(): void {
  g.__orasakaStore?.close();
  g.__orasakaStore = undefined;
}

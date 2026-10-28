import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/** False in the server HTML and during hydration, true on the client render after it. */
export function useClientReady() {
  return useSyncExternalStore(subscribe, onClient, onServer);
}

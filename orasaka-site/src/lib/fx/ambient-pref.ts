/**
 * Visitor's "pause background animation" preference: one source of truth for the footer toggle,
 * the CSS loops (html[data-ambient]) and the Canvas background. Storage failures (private mode,
 * disabled storage, quota) never break the UI: the preference then lives for the session only.
 */
const KEY = "orasaka:ambient";
const EVENT = "orasaka:ambient-change";

let memory: boolean | null = null;

function readStored(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "paused";
  } catch {
    return false;
  }
}

export function isAmbientPaused(): boolean {
  if (typeof window === "undefined") return false;
  if (memory === null) memory = readStored();
  return memory;
}

export function setAmbientPaused(paused: boolean) {
  memory = paused;
  try {
    window.localStorage.setItem(KEY, paused ? "paused" : "on");
  } catch {
    // Session-only preference.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeAmbient(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    memory = e.newValue === "paused";
    cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** html[data-ambient] pauses CSS loops; it reflects both the visitor's choice and a hidden tab. */
export function applyAmbientAttribute() {
  document.documentElement.dataset.ambient = isAmbientPaused() || document.hidden ? "paused" : "on";
}

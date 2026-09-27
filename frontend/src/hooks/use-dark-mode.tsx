import { useEffect, useState } from "react";

function readStoredTheme(): "dark" | "light" | null {
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* private mode or blocked storage */
  }
  return null;
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function initialDark(): boolean {
  const stored = readStoredTheme();
  if (stored) return stored === "dark";
  if (systemPrefersDark()) return true;
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

let sharedIsDark = initialDark();
let sharedFollowsSystem = readStoredTheme() == null;
const listeners = new Set<() => void>();
let systemListenerBound = false;

function applyDarkClass(isDark: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", isDark);
}

function emit() {
  applyDarkClass(sharedIsDark);
  for (const listener of listeners) listener();
}

function bindSystemListener() {
  if (systemListenerBound || typeof window === "undefined") return;
  systemListenerBound = true;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", () => {
    if (!sharedFollowsSystem) return;
    sharedIsDark = media.matches;
    emit();
  });
}

export function useDarkMode() {
  const [isDark, setIsDark] = useState(sharedIsDark);

  useEffect(() => {
    bindSystemListener();
    applyDarkClass(sharedIsDark);
    const sync = () => setIsDark(sharedIsDark);
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, []);

  const toggle = () => {
    sharedFollowsSystem = false;
    sharedIsDark = !sharedIsDark;
    try {
      localStorage.setItem("theme", sharedIsDark ? "dark" : "light");
    } catch {
      /* ignore */
    }
    emit();
  };

  return { isDark, toggle };
}

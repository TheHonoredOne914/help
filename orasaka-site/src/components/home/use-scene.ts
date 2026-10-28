"use client";

import { useEffect, useRef } from "react";

/** Marks the element data-motion=run only while it is on screen, the tab is visible, and motion is allowed. */
export function useScene<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let seen = false;
    const update = () => {
      const paused = document.hidden || document.documentElement.dataset.ambient === "paused" || reduce.matches;
      el.dataset.motion = seen && !paused ? "run" : "still";
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        seen = entry.isIntersecting;
        update();
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ambient"] });
    document.addEventListener("visibilitychange", update);
    reduce.addEventListener("change", update);
    update();
    return () => {
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", update);
      reduce.removeEventListener("change", update);
    };
  }, []);
  return ref;
}

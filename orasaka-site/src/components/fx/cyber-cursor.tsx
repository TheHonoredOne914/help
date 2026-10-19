"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * ORASAKA cyber cursor (desktop, fine pointer only).
 * The pointer tip is written synchronously in every pointermove at the exact event
 * coordinates, so the hit point never lags. Only decorative parts (trail, card frame
 * pull, click pulse) animate, and they are off with prefers-reduced-motion.
 * Shown in the top layer (popover) so it stays above modal <dialog>s.
 */

const INTERACTIVE = "a[href], button, summary, label[for], [role='button'], [role='tab'], select, [data-cursor='button']";
const TEXT_INPUT =
  "input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='button']):not([type='submit']):not([type='reset']), textarea, [contenteditable=''], [contenteditable='true']";
const TRAIL = 5;

type State = "default" | "button" | "card" | "disabled" | "text";

export function CyberCursor() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const mq = matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setEnabled(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const fail = useCallback(() => setEnabled(false), []);
  return enabled ? <CursorLayer onFail={fail} /> : null;
}

function CursorLayer({ onFail }: { onFail: () => void }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    const html = document.documentElement;
    if (!el) return;
    const pos = el.querySelector<HTMLElement>("[data-part='pos']");
    const frame = el.querySelector<HTMLElement>("[data-part='frame']");
    const trail = [...el.querySelectorAll<HTMLElement>("[data-part='trail']")];
    if (!pos || !frame) return onFail();

    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let x = -100;
    let y = -100;
    let state: State = "default";
    let card: HTMLElement | null = null;
    const history: { x: number; y: number; t: number }[] = [];
    let raf = 0;
    let scrollRaf = 0;

    try {
      if (typeof el.showPopover === "function") el.showPopover();
      html.dataset.cursor = "cyber";
    } catch {
      delete html.dataset.cursor;
      return onFail();
    }

    const setState = (next: State) => {
      if (next === state) return;
      state = next;
      el.dataset.state = next;
    };

    const placeFrame = () => {
      if (!card) return;
      const r = card.getBoundingClientRect();
      const pull = reduce.matches ? 0 : 0.035;
      const dx = (x - (r.left + r.width / 2)) * pull;
      const dy = (y - (r.top + r.height / 2)) * pull;
      frame.style.width = `${r.width + 12}px`;
      frame.style.height = `${r.height + 12}px`;
      frame.style.transform = `translate3d(${r.left - 6 + dx}px, ${r.top - 6 + dy}px, 0)`;
    };

    const classify = (target: Element | null) => {
      if (!target) return setState("default");
      if (target.closest(TEXT_INPUT)) return setState("text");
      const interactive = target.closest(INTERACTIVE);
      if (interactive) {
        const disabled = interactive.matches(":disabled, [aria-disabled='true']");
        card = null;
        el.dataset.card = "false";
        return setState(disabled ? "disabled" : "button");
      }
      const c = target.closest<HTMLElement>("[data-cursor='card']");
      card = c;
      el.dataset.card = c ? "true" : "false";
      if (c) placeFrame();
      setState(c ? "card" : "default");
    };

    const tick = () => {
      raf = 0;
      const now = performance.now();
      while (history.length && now - history[0].t > 90) history.shift();
      trail.forEach((t, i) => {
        const h = history[history.length - 1 - (i + 1) * 2];
        if (!h) {
          t.style.opacity = "0";
          return;
        }
        t.style.opacity = String(0.35 * (1 - i / TRAIL));
        t.style.transform = `translate3d(${h.x}px, ${h.y}px, 0) rotate(45deg)`;
      });
      if (history.length > 1) raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      x = e.clientX;
      y = e.clientY;
      pos.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      if (el.dataset.hidden) delete el.dataset.hidden;
      classify(e.target as Element);
      if (card) placeFrame();
      if (!reduce.matches) {
        history.push({ x, y, t: performance.now() });
        if (history.length > 16) history.shift();
        if (!raf) raf = requestAnimationFrame(tick);
      }
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      el.dataset.pressed = "true";
      if (reduce.matches) return;
      const p = document.createElement("span");
      p.className = "cc-pulse";
      p.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      el.appendChild(p);
      p.animate(
        [
          { opacity: 0.9, scale: "0.4", rotate: "45deg" },
          { opacity: 0, scale: "1.9", rotate: "45deg" },
        ],
        { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" },
      ).onfinish = () => p.remove();
    };
    const onUp = () => delete el.dataset.pressed;
    const onLeave = () => (el.dataset.hidden = "true");
    const onScroll = () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        if (x < 0) return;
        classify(document.elementFromPoint(x, y));
      });
    };

    // A modal dialog opening enters the top layer above us: re-insert so the cursor stays visible.
    const mo = new MutationObserver((records) => {
      if (!records.some((r) => r.target instanceof HTMLDialogElement)) return;
      try {
        el.hidePopover?.();
        el.showPopover?.();
      } catch {}
    });
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    html.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(scrollRaf);
      mo.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("scroll", onScroll);
      html.removeEventListener("pointerleave", onLeave);
      delete html.dataset.cursor;
    };
  }, [onFail]);

  return (
    <div
      ref={root}
      className="cyber-cursor"
      popover="manual"
      aria-hidden="true"
      data-state="default"
      data-hidden="true"
      data-testid="cyber-cursor"
    >
      <div data-part="frame" className="cc-frame">
        <span />
        <span />
      </div>
      {Array.from({ length: TRAIL }, (_, i) => (
        <span key={i} data-part="trail" className="cc-trail" />
      ))}
      <div data-part="pos" className="cc-pos">
        <svg className="cc-reticle" viewBox="-20 -20 40 40" width="40" height="40">
          <path d="M-13 -7V-13H-7M7 -13H13V-7M13 7V13H7M-7 13H-13V7" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M0 -4V-1M0 1V4M-4 0H-1M1 0H4" stroke="currentColor" strokeWidth="1" />
        </svg>
        <svg className="cc-pointer" viewBox="0 0 22 24" width="22" height="24">
          <path d="M0 0L17 7.2L9.4 9.3L6.6 17.4Z" fill="#FF2035" stroke="#080809" strokeWidth="1" strokeLinejoin="miter" />
          <path d="M10.6 11.2L16.2 16.6L14 18.1L9.3 13.1Z" fill="#FF2035" stroke="#080809" strokeWidth="0.8" />
          <path d="M1.6 19.6L6.2 18.4" stroke="#F5F5F5" strokeOpacity="0.7" strokeWidth="1" />
        </svg>
      </div>
    </div>
  );
}

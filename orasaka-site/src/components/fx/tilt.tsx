"use client";

import { useRef, type ComponentPropsWithoutRef, type ElementType } from "react";

type TiltProps<T extends ElementType> = { as?: T; max?: number; className?: string } & Omit<
  ComponentPropsWithoutRef<T>,
  "as" | "className"
>;

/**
 * Subtle cursor-reactive 3D tilt + red border glow. Writes CSS variables directly (no re-render);
 * active only for mouse/pen input, so touch scrolling is untouched. Reduced motion: CSS disables the tilt.
 */
export function Tilt<T extends ElementType = "div">({ as, max = 4, className, children, ...rest }: TiltProps<T>) {
  const Comp: ElementType = as ?? "div";
  const frame = useRef(0);

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (e.pointerType === "touch") return;
    const el = e.currentTarget;
    const { clientX, clientY } = e;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const nx = (clientX - r.left) / r.width - 0.5;
      const ny = (clientY - r.top) / r.height - 0.5;
      el.dataset.tilting = "true";
      el.style.setProperty("--tilt-x", `${(-ny * max).toFixed(2)}deg`);
      el.style.setProperty("--tilt-y", `${(nx * max).toFixed(2)}deg`);
      el.style.setProperty("--mx", `${((nx + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${((ny + 0.5) * 100).toFixed(1)}%`);
    });
  }

  function onPointerLeave(e: React.PointerEvent<HTMLElement>) {
    cancelAnimationFrame(frame.current);
    const el = e.currentTarget;
    delete el.dataset.tilting;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  }

  return (
    <Comp
      data-cursor="card"
      className={`tilt ${className ?? ""}`}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      {...rest}
    >
      {children}
    </Comp>
  );
}

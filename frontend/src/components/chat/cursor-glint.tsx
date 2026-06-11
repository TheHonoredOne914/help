import { useEffect, useRef, useState } from "react";

export function CursorGlint() {
  const glintRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const latestPointRef = useRef({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const scope = glintRef.current?.closest("[data-cursor-glint-scope]");
    if (!(scope instanceof HTMLElement)) return;

    const updatePosition = () => {
      frameRef.current = null;
      const { x, y } = latestPointRef.current;
      glintRef.current?.style.setProperty("--cursor-glint-x", `${x}px`);
      glintRef.current?.style.setProperty("--cursor-glint-y", `${y}px`);
    };

    const onPointerMove = (event: PointerEvent) => {
      latestPointRef.current = { x: event.clientX, y: event.clientY };
      setVisible(true);
      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(updatePosition);
      }
    };

    const onPointerEnter = () => setVisible(true);
    const onPointerLeave = () => setVisible(false);

    scope.addEventListener("pointermove", onPointerMove);
    scope.addEventListener("pointerenter", onPointerEnter);
    scope.addEventListener("pointerleave", onPointerLeave);

    return () => {
      scope.removeEventListener("pointermove", onPointerMove);
      scope.removeEventListener("pointerenter", onPointerEnter);
      scope.removeEventListener("pointerleave", onPointerLeave);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return <div ref={glintRef} className={`cursor-glint${visible ? " is-visible" : ""}`} aria-hidden="true" />;
}

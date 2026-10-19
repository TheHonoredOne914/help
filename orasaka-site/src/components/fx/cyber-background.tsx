"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { BackgroundEngine } from "@/lib/fx/background-engine";
import { initialQuality, isSceneId, sceneForPath, type SceneId } from "@/lib/fx/scenes";

/**
 * Fixed decorative layer behind all content. Never receives input (pointer-events: none);
 * listens on window instead. A static CSS layer is always underneath, so if Canvas 2D is
 * unavailable or throws, the page simply keeps the static look.
 */
export function CyberBackground() {
  return (
    <>
      <div aria-hidden="true" className="fx-static" />
      <Suspense fallback={<BackgroundCanvas pathname="" />}>
        <WithPath />
      </Suspense>
    </>
  );
}

function WithPath() {
  return <BackgroundCanvas pathname={usePathname()} />;
}

function BackgroundCanvas({ pathname }: { pathname: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const engine = useRef<BackgroundEngine | null>(null);
  const routeScene = useRef<SceneId>(sceneForPath(pathname));

  useEffect(() => {
    const canvas = ref.current;
    const root = document.documentElement;
    if (!canvas) return;
    const reduceMq = matchMedia("(prefers-reduced-motion: reduce)");
    const coarseMq = matchMedia("(pointer: coarse), (max-width: 767px)");

    let eng: BackgroundEngine | null = null;
    const nav = navigator as Navigator & { deviceMemory?: number };

    function create() {
      eng?.destroy();
      eng = null;
      canvas!.dataset.ready = "false";
      try {
        const mobile = coarseMq.matches;
        eng = new BackgroundEngine(canvas!, {
          mobile,
          reducedMotion: reduceMq.matches,
          quality: initialQuality({ mobile, cores: nav.hardwareConcurrency, memoryGb: nav.deviceMemory }),
          onQuality: (q) => (canvas!.dataset.quality = String(q)),
          onFirstFrame: () => (canvas!.dataset.ready = "true"),
        });
        canvas!.dataset.quality = String(eng.currentQuality);
        eng.setScene(routeScene.current);
        root.dataset.fx = reduceMq.matches ? "static" : "live";
        if (!document.hidden) eng.start();
      } catch {
        eng = null;
        root.dataset.fx = "fallback";
      }
      engine.current = eng;
    }
    create();

    let resizeRaf = 0;
    let lastW = window.innerWidth;
    let lastH = window.innerHeight;
    const onResize = () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        // Mobile URL-bar show/hide only changes height slightly: skip the expensive rebuild.
        if (window.innerWidth === lastW && Math.abs(window.innerHeight - lastH) < 120) return;
        lastW = window.innerWidth;
        lastH = window.innerHeight;
        eng?.resize();
      });
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || e.pointerType === "pen") eng?.pointer(e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => eng?.click(e.clientX, e.clientY);
    const onLeave = () => eng?.pointerLeave();
    const onVisibility = () => (document.hidden ? eng?.stop() : eng?.start());

    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    root.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    reduceMq.addEventListener("change", create);
    coarseMq.addEventListener("change", create);

    return () => {
      cancelAnimationFrame(resizeRaf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      root.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      reduceMq.removeEventListener("change", create);
      coarseMq.removeEventListener("change", create);
      eng?.destroy();
      engine.current = null;
      delete root.dataset.fx;
    };
  }, []);

  // Route sets the base composition; a section marked data-scene near the viewport centre overrides it.
  useEffect(() => {
    routeScene.current = sceneForPath(pathname);
    engine.current?.setScene(routeScene.current);
    const visible = new Map<Element, SceneId>();
    const apply = () => {
      const last = [...visible.values()].at(-1);
      engine.current?.setScene(last ?? routeScene.current);
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.scene;
          if (e.isIntersecting && isSceneId(id)) visible.set(e.target, id);
          else visible.delete(e.target);
        }
        apply();
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    const t = setTimeout(() => document.querySelectorAll("[data-scene]").forEach((el) => io.observe(el)), 0);
    return () => {
      clearTimeout(t);
      io.disconnect();
    };
  }, [pathname]);

  return <canvas ref={ref} aria-hidden="true" className="fx-canvas" data-ready="false" />;
}

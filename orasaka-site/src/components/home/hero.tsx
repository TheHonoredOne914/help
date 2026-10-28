"use client";

import { useEffect, useRef } from "react";
import { ButtonLink } from "@/components/ui";
import { useDict } from "@/components/locale-provider";
import { useScene } from "./use-scene";

const ANGLES = [180, 205, 155, 230, 130, 0, 25, -25, 50, -50];
const LABEL_KEYS = ["ORASAKA", "VPN", "Android", "iOS", "Windows", "macOS", "Telegram", "", "", ""] as const;

export function Hero() {
  const dict = useDict();
  const ref = useScene<HTMLElement>();
  return (
    <section ref={ref} data-scene="hero" className="hero-stage overflow-hidden px-6 pb-12 pt-7 md:pb-16 md:pt-24" aria-labelledby="hero-title">
      <HeroNetwork />
      <div className="hero-copy mx-auto flex max-w-[780px] flex-col items-center text-center">
        <p className="hero-eyebrow glitch font-mono text-[13px] font-bold tracking-[1px] text-[#ff4433]" data-text={dict.hero.eyebrow}>{dict.hero.eyebrow}</p>
        <h1 id="hero-title" className="h1 mt-4">
          {dict.hero.h1a}
          {dict.hero.h1b ? <><br />{dict.hero.h1b}</> : null}
        </h1>
        <p data-testid="hero-lead" className="mt-4 max-w-[560px] text-[15px] leading-6 text-muted md:text-[18px] md:leading-[28.8px]">
          {dict.hero.lead}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3.5">
          <ButtonLink href="/connect" size="hero">{dict.hero.connect}</ButtonLink>
          <ButtonLink href="/pricing" variant="secondary" size="hero">
            {dict.hero.pricing}
          </ButtonLink>
        </div>
        <p className="mt-3 font-mono text-[13px] text-muted">{dict.hero.note}</p>
        <Terminal />
      </div>
    </section>
  );
}

function HeroNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = host.clientWidth;
      const h = host.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number, live: boolean) => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      const mobile = w < 768;
      const count = mobile ? 5 : 10;
      const rx = Math.min(w * (mobile ? 0.3 : 0.33), w / 2 - 96);
      const ry = h * 0.32;
      const cx = w / 2;
      const cy = h * 0.46;
      ctx.clearRect(0, 0, w, h);
      const glow = ctx.createRadialGradient(cx, h * 0.2, 0, cx, h * 0.2, Math.min(450, w * 0.45));
      glow.addColorStop(0, "rgba(229,35,27,0.08)");
      glow.addColorStop(0.7, "rgba(229,35,27,0)");
      glow.addColorStop(1, "rgba(229,35,27,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < 10; i += 1) {
        const show = i < count && LABEL_KEYS[i] !== "" || (i < count && !mobile);
        const rad = (ANGLES[i] * Math.PI) / 180;
        const drift = live ? Math.sin(now / 1700 + i * 0.7) * 11 : 0;
        const x = cx + Math.cos(rad) * rx + Math.cos(rad + 0.6) * drift;
        const y = cy + Math.sin(rad) * ry * 0.72 + Math.sin(rad) * drift * 0.4;
        pts.push({ x, y });
        const lab = labels.current[i];
        if (!lab) continue;
        const visible = i < count && LABEL_KEYS[i] !== "";
        lab.hidden = !visible || !show;
        if (!visible) continue;
        const px = (x / w) * 100;
        const py = (y / h) * 100;
        lab.style.left = `${Math.min(84, Math.max(16, px))}%`;
        lab.style.top = `${Math.min(82, Math.max(16, py))}%`;
        if (px > 30 && px < 70 && py > 18 && py < 58) lab.hidden = true;
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      pts.slice(0, count).forEach((point, index) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        if (live && index === Math.floor(now / 3000) % count) {
          const t = (now % 3000) / 3000;
          ctx.fillStyle = "#ffd0c8";
          ctx.beginPath();
          ctx.arc(cx + (point.x - cx) * t, cy + (point.y - cy) * t, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#ff4433";
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3.4, 0, Math.PI * 2);
        ctx.fill();
      });
      const haloT = live ? (now % 2400) / 2400 : 0.35;
      ctx.beginPath();
      ctx.arc(cx, cy, 8 + haloT * 22, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(229,35,27,${live ? 0.6 * (1 - haloT) : 0.4})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#e5231b";
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
    };

    const frame = (now: number) => {
      raf = 0;
      const live = !document.hidden && !reduce.matches && host.closest("[data-scene]")?.getAttribute("data-motion") === "run";
      draw(now, live);
      canvas.dataset.ready = "true";
      if (live) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    };
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      kick();
    });
    ro.observe(host);
    const scene = host.closest("[data-scene]") ?? host;
    const mo = new MutationObserver(kick);
    mo.observe(scene, { attributes: true, attributeFilter: ["data-motion"] });
    document.addEventListener("visibilitychange", kick);
    reduce.addEventListener("change", kick);
    kick();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", kick);
      reduce.removeEventListener("change", kick);
    };
  }, []);

  return (
    <div className="hero-net" aria-hidden="true">
      <canvas ref={canvasRef} />
      <svg viewBox="0 0 480 480" preserveAspectRatio="xMidYMid slice">
        <circle cx="240" cy="220" r="150" fill="#e5231b" fillOpacity=".05" />
        <g stroke="#e5231b" fill="none">
          <circle cx="240" cy="220" r="150" strokeWidth="2" strokeDasharray="40 14" />
          <path d="M70 220h70M340 220h70M240 80v60M240 300v60" strokeOpacity=".45" />
        </g>
      </svg>
      {LABEL_KEYS.map((label, i) =>
        label ? (
          <span key={label} ref={(node) => { labels.current[i] = node; }} className="hero-label" hidden>
            {label}
          </span>
        ) : (
          <span key={i} ref={(node) => { labels.current[i] = node; }} hidden />
        ),
      )}
    </div>
  );
}

function Terminal() {
  const dict = useDict();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lines = [...root.querySelectorAll<HTMLElement>("[data-line]")];
    lines.forEach((line) => {
      line.style.visibility = "hidden";
    });
    let index = 0;
    const reveal = () => {
      const line = lines[index];
      if (line) line.style.visibility = "visible";
      index += 1;
    };
    reveal();
    const id = window.setInterval(() => {
      reveal();
      if (index >= lines.length) window.clearInterval(id);
    }, 420);
    return () => window.clearInterval(id);
  }, []);
  const d = dict.term;
  const lines = [
    { text: d.cmd, tone: "" },
    { text: d.ok1, tone: "ok" },
    { text: d.ok2, tone: "ok" },
    { text: d.ok3, tone: "ok" },
  ];
  return (
    <>
      <p className="mt-8 font-mono text-[12px] text-muted">{d.caption}</p>
      <div ref={ref} className="hero-term" aria-hidden="true">
        <div className="hero-term-bar"><i /></div>
        {lines.map((line) => (
          <div key={line.text} data-line="" className={line.tone}>{line.text}</div>
        ))}
        <div>$ <span className="hero-caret" /></div>
      </div>
      <ul className="hero-widgets">
        {d.widgets.map((item) => (
          <li key={item.title}>
            <span className={`widget-mark ${item.title === "HTTPS" ? "flash" : ""}`} aria-hidden="true" />
            <b>{item.title}</b>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

"use client";

import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { brand } from "@/config/brand";
import { ButtonLink, ExternalButton } from "@/components/ui";

const ease = [0.22, 1, 0.36, 1] as const;

const chips = [
  { label: "VLESS Reality", className: "left-[-6%] top-[14%]", delay: 0.9 },
  { label: "Happ · V2RayTun", className: "right-[-6%] top-[20%]", delay: 1.05 },
  { label: "Поддержка в Telegram", className: "left-[6%] bottom-[-5%]", delay: 1.2 },
];

/** Desktop-class pointer and width: enables tilt and parallax. */
function useRichMotion() {
  const reduce = useReducedMotion();
  const [rich, setRich] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine) and (min-width: 1024px)");
    const update = () => setRich(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return rich && !reduce;
}

function Letters({ text, delay, className }: { text: string; delay: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <span className={className} aria-hidden="true">
      {text.split("").map((ch, i) => (
        <motion.span
          key={i}
          className="inline-block"
          initial={{ opacity: 0, y: reduce ? 0 : "0.45em" }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: delay + i * 0.04, ease }}
        >
          {ch}
        </motion.span>
      ))}
    </span>
  );
}

export function Hero() {
  const reduce = useReducedMotion();
  const rich = useRichMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });
  const parallax = useTransform(scrollYProgress, [0, 1], [0, rich ? 80 : 0]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, rich ? 0.35 : 1]);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-5, 5]), { stiffness: 120, damping: 18 });
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [4, -4]), { stiffness: 120, damping: 18 });

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!rich) return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  }
  function onPointerLeave() {
    mx.set(0);
    my.set(0);
  }

  const enter = (delay: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay, ease },
  });

  return (
    <section ref={sectionRef} aria-labelledby="hero-title" className="relative isolate overflow-hidden border-b border-line">
      <div aria-hidden="true" className="grid-lines absolute inset-0 -z-10" />
      <div aria-hidden="true" className="glow-lg ambient absolute -left-48 top-0 -z-10 size-[38rem] animate-pulse-glow rounded-full bg-accent/25 blur-[140px]" />
      <div aria-hidden="true" className="glow-lg absolute -right-40 bottom-0 -z-10 size-[30rem] rounded-full bg-accent/15 blur-[120px]" />
      <p
        aria-hidden="true"
        lang="ja"
        className="text-outline pointer-events-none absolute -bottom-6 right-0 -z-10 hidden select-none font-display text-[16rem] font-extrabold leading-none lg:block"
      >
        オラサカ
      </p>

      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:min-h-[calc(100svh-6.5rem)] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14 lg:px-8 lg:py-16">
        <div className="relative z-10 order-2 lg:order-1">
          <motion.p {...enter(0)} className="mb-5 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.3em] text-accent">
            <span aria-hidden="true" className="ambient size-2 animate-blink rounded-full bg-accent" />
            VPN-подписка в Telegram
          </motion.p>

          <h1 id="hero-title" className="font-display text-[clamp(2.6rem,11.5vw,4.75rem)] font-extrabold leading-[0.9] tracking-tight lg:text-[clamp(3rem,4.6vw,4.6rem)]">
            <span className="sr-only">ORASAKA VPN</span>
            <Letters text="ORASAKA" delay={0.1} className="block whitespace-nowrap" />
            <span className="ambient block animate-glitch">
              <Letters text="VPN" delay={0.42} className="block whitespace-nowrap text-accent" />
            </span>
          </h1>

          <motion.p {...enter(0.55)} className="mt-6 max-w-xl text-base leading-relaxed text-muted text-pretty sm:text-lg">
            Подписка оформляется в Telegram-боте {brand.telegramBot.handle}: протокол VLESS Reality, приложения Happ
            и V2RayTun, личный кабинет и поддержка — в одном месте.
          </motion.p>

          <motion.div {...enter(0.68)} className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <ButtonLink href="/pricing" className="px-7">
              Тарифы
            </ButtonLink>
            <ButtonLink href="/connect" variant="secondary" className="px-7">
              Как подключиться
            </ButtonLink>
            <ExternalButton href={brand.telegramBot.url} variant="ghost">
              {brand.telegramBot.handle} <span aria-hidden="true">→</span>
            </ExternalButton>
          </motion.div>

          <motion.dl {...enter(0.8)} className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-6 font-mono text-[11px] uppercase tracking-widest">
            {[
              ["Протокол", "VLESS"],
              ["Клиенты", "Happ"],
              ["Канал", "Telegram"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted">{k}</dt>
                <dd className="mt-1 text-fg">{v}</dd>
              </div>
            ))}
          </motion.dl>
        </div>

        <motion.div style={{ y: parallax, opacity: fade }} className="relative order-1 lg:order-2">
          <div aria-hidden="true" className="absolute inset-0 -z-10 hidden items-center justify-center md:flex">
            <svg viewBox="0 0 400 400" className="ambient size-[115%] animate-spin-slow text-accent/30">
              <circle cx="200" cy="200" r="190" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 10" />
              <circle cx="200" cy="200" r="160" fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="40 14 4 14" />
            </svg>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: reduce ? 1 : 0.94, y: reduce ? 0 : 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease }}
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
            style={{ rotateX, rotateY, transformPerspective: 1200 }}
            className="relative"
          >
            <div aria-hidden="true" className="glow-lg absolute -inset-8 -z-10 rounded-[2rem] bg-accent/25 blur-3xl" />
            <div className="corner-frame relative overflow-hidden rounded-2xl border border-accent/40 bg-black shadow-[0_40px_120px_-40px_rgb(255_35_70/0.75)]">
              <div className="ambient animate-breathe">
                <Image
                  src={brand.hero.src}
                  width={brand.hero.width}
                  height={brand.hero.height}
                  alt={brand.hero.alt}
                  priority
                  sizes="(min-width: 1280px) 720px, (min-width: 1024px) 56vw, 100vw"
                  className="h-auto w-full object-contain"
                />
              </div>
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="ambient h-1/5 w-full animate-scan bg-gradient-to-b from-transparent via-white/[0.05] to-transparent" />
              </div>
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-3 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-white/80">
                <span className="flex items-center gap-2">
                  <span className="ambient size-1.5 animate-blink rounded-full bg-accent" /> ORASAKA // NET
                </span>
                <span lang="ja">オラサカ</span>
              </div>
            </div>

            {chips.map((c) => (
              <motion.span
                key={c.label}
                aria-hidden="true"
                initial={{ opacity: 0, y: reduce ? 0 : 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: c.delay, ease }}
                className={`absolute hidden lg:block ${c.className}`}
              >
                <span className="ambient block animate-float rounded-md border border-accent/40 bg-bg/85 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-fg shadow-[0_10px_30px_-10px_rgb(255_35_70/0.6)] backdrop-blur-sm">
                  <span className="mr-2 text-accent">▍</span>
                  {c.label}
                </span>
              </motion.span>
            ))}
          </motion.div>
        </motion.div>
      </div>

      <Ticker />
    </section>
  );
}

const tickerItems = ["VLESS Reality", "オラサカ", "Happ", "V2RayTun", "Личный кабинет", "Telegram-бот", "ORASAKA VPN"];

function Ticker() {
  return (
    <div aria-hidden="true" className="relative overflow-hidden border-t border-line bg-surface/60 py-3">
      <div className="ambient flex w-max animate-marquee whitespace-nowrap font-mono text-xs uppercase tracking-[0.3em] text-muted">
        {[0, 1].map((k) => (
          <div key={k} className="flex gap-10 pr-10">
            {tickerItems.map((t) => (
              <span key={t} className="flex items-center gap-10">
                {t}
                <span className="text-accent">✦</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

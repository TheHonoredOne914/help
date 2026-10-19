"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { brand } from "@/config/brand";
import { ButtonLink, ExternalButton } from "@/components/ui";

const ease = [0.22, 1, 0.36, 1] as const;

function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine) and (min-width: 1024px)");
    const update = () => setFine(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return fine;
}

export function Hero() {
  const reduce = useReducedMotion();
  const finePointer = useFinePointer();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const parallax = useTransform(scrollYProgress, [0, 1], [0, reduce || !finePointer ? 0 : 60]);

  const enter = (delay: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay, ease },
  });

  return (
    <section ref={ref} aria-labelledby="hero-title" className="relative overflow-hidden border-b border-line">
      <div aria-hidden="true" className="grid-lines absolute inset-0" />
      <div aria-hidden="true" className="ambient absolute -left-40 top-10 size-[34rem] animate-pulse-glow rounded-full bg-accent/20 blur-[120px]" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)] lg:gap-12 lg:px-8 lg:py-24">
        <div>
          <motion.p {...enter(0)} className="mb-5 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.3em] text-accent">
            <span aria-hidden="true" className="h-px w-10 bg-accent" />
            VPN-подписка в Telegram
          </motion.p>

          <motion.h1
            id="hero-title"
            {...enter(0.08)}
            className="font-display text-[clamp(2.75rem,9vw,6rem)] font-extrabold leading-[0.92] tracking-tight"
          >
            ORASAKA
            <span className="ambient block animate-glitch text-accent">VPN</span>
          </motion.h1>

          <motion.p {...enter(0.18)} className="mt-6 max-w-xl text-base leading-relaxed text-muted text-pretty sm:text-lg">
            Подписка оформляется в Telegram-боте {brand.telegramBot.handle}. Подключение по протоколу VLESS Reality
            через приложения Happ или V2RayTun, личный кабинет и поддержка — там же, в Telegram.
          </motion.p>

          <motion.div {...enter(0.28)} className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <ButtonLink href="/#tariffs" className="px-7">
              Тарифы
            </ButtonLink>
            <ButtonLink href="/connect" variant="secondary" className="px-7">
              Как подключиться
            </ButtonLink>
            <ExternalButton href={brand.telegramBot.url} variant="ghost">
              {brand.telegramBot.handle} <span aria-hidden="true">→</span>
            </ExternalButton>
          </motion.div>
        </div>

        <motion.div
          initial={{ scale: reduce ? 1 : 0.97 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.7, ease }}
          style={{ y: parallax }}
          className="relative"
        >
          <div aria-hidden="true" className="absolute -inset-6 rounded-3xl bg-accent/20 blur-3xl" />
          <div className="corner-frame relative overflow-hidden rounded-xl border border-accent/30 bg-black shadow-[0_30px_80px_-30px_rgb(255_35_70/0.55)]">
            <Image
              src={brand.hero.src}
              width={brand.hero.width}
              height={brand.hero.height}
              alt={brand.hero.alt}
              priority
              sizes="(min-width: 1280px) 680px, (min-width: 1024px) 54vw, 100vw"
              className="h-auto w-full object-contain"
            />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="ambient h-24 w-full animate-scan bg-gradient-to-b from-transparent via-white/[0.04] to-transparent" />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

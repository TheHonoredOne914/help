"use client";

import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";

const ease = [0.22, 1, 0.36, 1] as const;

export function Reveal({
  delay = 0,
  className,
  children,
  as = "div",
}: {
  delay?: number;
  className?: string;
  children: React.ReactNode;
  as?: "div" | "li" | "section";
}) {
  const reduce = useReducedMotion();
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.4, delay, ease }}
    >
      {children}
    </Comp>
  );
}

/** Thin accent line that draws in when the section enters the viewport. */
export function SectionRule({ index }: { index: string }) {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden="true" className="mx-auto flex max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
      <span className="font-mono text-xs text-accent">/{index}</span>
      <motion.span
        className="h-px flex-1 origin-left bg-gradient-to-r from-accent via-accent/40 to-transparent"
        initial={{ scaleX: reduce ? 1 : 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.45, ease }}
      />
    </div>
  );
}

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30, restDelta: 0.001 });
  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-accent"
    />
  );
}

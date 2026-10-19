"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ComponentProps } from "react";

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
      initial={{ opacity: 0, y: reduce ? 0 : 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Comp>
  );
}

export function HoverLift(props: ComponentProps<typeof motion.div>) {
  return <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.15 }} {...props} />;
}

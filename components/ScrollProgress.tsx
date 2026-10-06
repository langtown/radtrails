"use client";

import { motion, useScroll, useSpring, useReducedMotion } from "motion/react";

/** Thin top progress bar tracking page scroll. Decorative (aria-hidden). */
export default function ScrollProgress() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 40, mass: 0.2 });

  return (
    <motion.div
      className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-[#a8bd6a]"
      style={{ scaleX: reduce ? scrollYProgress : scaleX }}
      aria-hidden
    />
  );
}

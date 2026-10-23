"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Re-mounts per navigation, so each route fades in. Opacity only (no transform)
 * to avoid fighting the in-page scroll reveals or causing layout shift.
 */
export default function Template({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.4, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

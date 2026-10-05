"use client";

import { motion, useReducedMotion, useInView } from "motion/react";
import { useRef } from "react";

/**
 * Renders each line of text rising out from behind a mask, staggered.
 * The in-view trigger is measured on the OUTER container (never the clipped
 * children), so the mask reveal fires reliably. `trigger` only tunes the margin.
 */
export default function LineReveal({
  lines,
  className,
  lineClassName = "",
  delay = 0,
  trigger = "load",
}: {
  lines: (string | React.ReactNode)[];
  className?: string;
  lineClassName?: string;
  delay?: number;
  trigger?: "load" | "view";
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: trigger === "load" ? "0px" : "-8% 0px" });

  if (reduce) {
    return (
      <div className={className}>
        {lines.map((line, i) => (
          <span key={i} className={`block ${lineClassName}`}>
            {line}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} className={className}>
      {lines.map((line, i) => (
        <span key={i} className="block overflow-hidden pb-[0.08em]">
          <motion.span
            className={`block ${lineClassName}`}
            initial={{ y: "110%" }}
            animate={inView ? { y: "0%" } : { y: "110%" }}
            transition={{ duration: 1, delay: delay + i * 0.11, ease: [0.22, 1, 0.36, 1] }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </div>
  );
}

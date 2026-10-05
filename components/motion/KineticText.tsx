"use client";

import { motion, useReducedMotion, useInView } from "motion/react";
import { useRef } from "react";

type Segment = { text: string; className?: string };
type Line = Segment[];

/**
 * Per-letter mask reveal: every character rises out from behind its line,
 * staggered across the whole headline for a wave effect. Segments allow mixed
 * styling (e.g. an italic-serif phrase) within a line. In-view is measured on
 * the outer container so the clipped letters always trigger. Reduced-motion and
 * screen readers get clean, static text via aria-label.
 */
export default function KineticText({
  lines,
  className,
  lineClassName = "",
  stagger = 0.028,
  delay = 0,
  duration = 0.7,
}: {
  lines: Line[];
  className?: string;
  lineClassName?: string;
  stagger?: number;
  delay?: number;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px" });
  const label = lines.map((segs) => segs.map((s) => s.text).join("")).join(" ");

  if (reduce) {
    return (
      <div className={className}>
        {lines.map((segs, li) => (
          <span key={li} className={`block ${lineClassName}`}>
            {segs.map((s, si) => (
              <span key={si} className={s.className}>
                {s.text}
              </span>
            ))}
          </span>
        ))}
      </div>
    );
  }

  let i = 0; // running letter index for a continuous stagger across lines

  return (
    <div ref={ref} className={className} aria-label={label}>
      {lines.map((segs, li) => (
        <span key={li} className={`block overflow-hidden pb-[0.1em] ${lineClassName}`} aria-hidden>
          {segs.map((s, si) => (
            <span key={si} className={`inline-block ${s.className ?? ""}`}>
              {s.text.split(/(\s+)/).map((chunk, ci) =>
                /\s+/.test(chunk) ? (
                  <span key={ci}>&nbsp;</span>
                ) : (
                  <span key={ci} className="inline-block whitespace-nowrap">
                    {[...chunk].map((ch, chi) => {
                      const d = delay + i++ * stagger;
                      return (
                        <motion.span
                          key={chi}
                          className="inline-block"
                          initial={{ y: "120%" }}
                          animate={inView ? { y: "0%" } : { y: "120%" }}
                          transition={{ duration, delay: d, ease: [0.22, 1, 0.36, 1] }}
                        >
                          {ch}
                        </motion.span>
                      );
                    })}
                  </span>
                ),
              )}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

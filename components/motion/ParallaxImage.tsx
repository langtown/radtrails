"use client";

import Image from "next/image";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";
import { useRef } from "react";

/**
 * Full-bleed image inside a fixed-size, overflow-hidden frame. The image is
 * over-scaled and drifts vertically with scroll for a parallax effect.
 * The frame itself is the sizing/rounding element (pass those via className).
 */
export default function ParallaxImage({
  src,
  alt,
  className = "",
  imgClassName = "",
  sizes,
  priority,
  strength = 70,
  objectPosition,
}: {
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  sizes?: string;
  priority?: boolean;
  strength?: number;
  objectPosition?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [-strength, strength]);

  return (
    <div ref={ref} className={`overflow-hidden ${className}`}>
      <motion.div
        className="absolute inset-[-12%] will-change-transform"
        style={reduce ? undefined : { y }}
      >
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={`object-cover ${imgClassName}`} style={objectPosition ? { objectPosition } : undefined} />
      </motion.div>
    </div>
  );
}

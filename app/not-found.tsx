import Link from "next/link";
import Reveal from "@/components/motion/Reveal";
import LineReveal from "@/components/motion/LineReveal";

export default function NotFound() {
  return (
    <div className="grain flex min-h-[80vh] items-center bg-[#08080a] text-white">
      <div className="mx-auto max-w-3xl px-5 py-24 text-center md:px-10">
        <Reveal className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">404 — Off the trail</Reveal>
        <LineReveal
          className="display mt-5 text-5xl font-extrabold leading-[0.95] md:text-8xl"
          lines={["Page not", <span key="f" className="serif-italic font-light">found</span>]}
        />
        <Reveal delay={0.15} className="mx-auto mt-6 max-w-md text-lg leading-relaxed text-white/55">
          Looks like this route doesn&apos;t exist. Let&apos;s get you back on the map.
        </Reveal>
        <Reveal delay={0.25} className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link href="/" className="group inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-[#08080a] transition-transform duration-300 hover:-translate-y-0.5">
            Back home <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden>→</span>
          </Link>
          <Link href="/racing" className="inline-flex items-center rounded-full border border-white/25 px-8 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:border-white/60">
            Meet the team
          </Link>
        </Reveal>
      </div>
    </div>
  );
}

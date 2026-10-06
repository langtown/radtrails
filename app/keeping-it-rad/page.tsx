import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Reveal from "@/components/motion/Reveal";
import ParallaxImage from "@/components/motion/ParallaxImage";
import {
  conservationContent,
  conservationPageMeta,
} from "@/lib/content/conservation";

export const metadata: Metadata = {
  title: conservationPageMeta.title,
  description: conservationPageMeta.description,
  keywords: conservationPageMeta.keywords,
  alternates: { canonical: conservationPageMeta.path },
};

export default function KeepingItRadPage() {
  return (
    <div className="grain bg-[#08080a] text-white">
      <section className="relative flex min-h-[80vh] items-center overflow-hidden">
        <Image
          src="/images/home/stage5.jpg"
          alt="Mountain biker riding a local trail"
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-[0.55]"
          style={{
            objectPosition: "35% top",
            transform: "translate(5%, -5%) scale(1.1)",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#08080a]/50 via-[#08080a]/25 to-[#08080a]" />
        <div className="relative z-[1] mx-auto w-full max-w-7xl px-5 py-32 md:px-10">
          <div className="max-w-4xl">
            <Reveal className="eyebrow flex items-center gap-2.5 text-xs uppercase tracking-[0.3em] text-white/55">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#a8bd6a]" />
              {conservationContent.eyebrow}
            </Reveal>
            <Reveal delay={0.1}>
              <h1 className="display mt-7 text-[clamp(2.6rem,8vw,6.5rem)] font-extrabold leading-[0.95]">
                {conservationContent.title}
              </h1>
            </Reveal>
            <Reveal delay={0.4} className="mt-7 max-w-xl text-lg leading-relaxed text-white/60 md:text-xl">
              {conservationContent.introduction}
            </Reveal>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-20 md:grid-cols-2 md:gap-16 md:px-10 md:py-28">
        <Reveal>
          <p className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">
            Our approach
          </p>
          <h2 className="display mt-4 text-3xl font-bold leading-[1.05] md:text-5xl">
            Trail Work &amp; <span className="serif-italic font-light">Conservancy</span>
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-white/55">
            {conservationContent.mission}
          </p>
          <p className="mt-5 text-lg leading-relaxed text-white/55">
            {conservationContent.commitment}
          </p>
        </Reveal>
        <ParallaxImage
          src="/images/home/gallery/trail.jpg"
          alt="A maintained trail winding through the hills"
          sizes="(min-width: 768px) 50vw, 100vw"
          strength={50}
          className="relative min-h-[320px] rounded-2xl md:min-h-[440px]"
        />
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-28">
          <Reveal className="max-w-3xl">
            <h2 className="display text-3xl font-bold leading-[1.05] md:text-5xl">
              Caring for trails <span className="serif-italic font-light">together</span>
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-white/55">
              Sustainable trails depend on informed, involved communities.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {conservationContent.principles.map((principle, index) => (
              <Reveal
                key={principle.title}
                delay={index * 0.1}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-7"
              >
                <article>
                  <p className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">(0{index + 1})</p>
                  <h3 className="display mt-4 text-2xl font-bold">{principle.title}</h3>
                  <p className="mt-4 leading-relaxed text-white/55">
                    {principle.body}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/10">
        <Reveal className="mx-auto max-w-4xl px-5 py-24 text-center md:px-10 md:py-32">
          <h2 className="display text-4xl font-extrabold leading-[1.0] md:text-6xl">Get <span className="serif-italic font-light">involved</span></h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/60">
            Connect with Ride and Develop to learn about trail work, community
            events, and local conservation efforts.
          </p>
          <Link
            href="/support"
            className="group mt-9 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-[#08080a] transition-transform duration-300 hover:-translate-y-0.5"
          >
            Contact us <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden>→</span>
          </Link>
        </Reveal>
      </section>
    </div>
  );
}

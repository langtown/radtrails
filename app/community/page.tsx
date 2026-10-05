import type { Metadata } from "next";
import Link from "next/link";
import { communityPageMeta, communityIntro, communityPillars } from "@/lib/content/community";
import Reveal from "@/components/motion/Reveal";
import LineReveal from "@/components/motion/LineReveal";
import ParallaxImage from "@/components/motion/ParallaxImage";

export const metadata: Metadata = {
  title: communityPageMeta.title,
  description: communityPageMeta.description,
  keywords: communityPageMeta.keywords,
  alternates: { canonical: communityPageMeta.path },
};

export default function CommunityPage() {
  return (
    <div className="grain bg-[#08080a] text-white">
      <section className="relative flex min-h-[80vh] items-center overflow-hidden">
        <ParallaxImage src="/images/athletes/chinapeak-team-2024.jpg" alt="Ride and Develop team at China Peak 2024" priority sizes="100vw" strength={50} className="absolute inset-0" imgClassName="opacity-[0.55]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#08080a]/50 via-[#08080a]/25 to-[#08080a]" />
        <div className="relative z-[1] mx-auto w-full max-w-7xl px-5 py-32 md:px-10">
          <Reveal className="eyebrow flex items-center gap-2.5 text-xs uppercase tracking-[0.3em] text-white/55">
            <span className="h-1.5 w-1.5 rounded-full bg-[#a8bd6a]" /> Everyone belongs here
          </Reveal>
          <LineReveal
            className="display mt-7 text-[clamp(2.6rem,8vw,6.5rem)] font-extrabold leading-[0.95]"
            delay={0.1}
            lines={["Rooted in", <span key="c" className="serif-italic font-light">community</span>]}
          />
          <Reveal delay={0.4} className="mt-7 max-w-xl text-lg leading-relaxed text-white/60 md:text-xl">{communityIntro}</Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-28">
        <div className="grid gap-20 md:gap-28">
          {communityPillars.map((pillar, i) => (
            <div key={pillar.title} className={`grid items-center gap-10 md:grid-cols-2 md:gap-16 ${i % 2 === 1 ? "md:[&>*:first-child]:order-last" : ""}`}>
              <div>
                <Reveal className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">{`(0${i + 1})`}</Reveal>
                <LineReveal trigger="view" delay={0.05} className="display mt-4 text-3xl font-bold leading-[1.05] md:text-5xl" lines={[pillar.title]} />
                <Reveal delay={0.15} className="mt-5 text-lg leading-relaxed text-white/55">{pillar.body}</Reveal>
              </div>
              <ParallaxImage src={pillar.image} alt={pillar.imageAlt} sizes="(min-width: 768px) 50vw, 100vw" strength={50} className="relative min-h-[320px] rounded-2xl md:min-h-[440px]" imgClassName={pillar.imagePosition ? "" : ""} />
            </div>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-white/10">
        <ParallaxImage src="/images/athletes/chinapeak-team-2024.jpg" alt="" sizes="100vw" strength={60} className="absolute inset-0" imgClassName="opacity-[0.15]" />
        <div className="absolute inset-0 bg-[#08080a]/70" />
        <div className="relative mx-auto max-w-4xl px-5 py-24 text-center md:px-10 md:py-32">
          <LineReveal trigger="view" className="display text-4xl font-extrabold leading-[1.0] md:text-6xl" lines={["Get", <span key="i" className="serif-italic font-light">involved</span>]} />
          <Reveal delay={0.15} className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/60">
            Whether you want to volunteer at a trail day, coach a youth team, or simply show up and ride — there is a place for you in this community.
          </Reveal>
          <Reveal delay={0.25} className="mt-9 flex flex-wrap justify-center gap-4">
            <Link href="/support" className="group inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-[#08080a] transition-transform duration-300 hover:-translate-y-0.5">
              Contact us <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden>→</span>
            </Link>
            <Link href="/racing" className="inline-flex items-center rounded-full border border-white/25 px-8 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:border-white/60">
              Meet the team
            </Link>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

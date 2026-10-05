import type { Metadata } from "next";
import RacerGrid from "@/components/RacerGrid";
import { alumni, alumniPageMeta } from "@/lib/content/racing";
import { toRacingCards } from "@/lib/racing-profiles";
import Reveal from "@/components/motion/Reveal";
import LineReveal from "@/components/motion/LineReveal";

export const metadata: Metadata = {
  title: alumniPageMeta.title,
  description: alumniPageMeta.description,
  keywords: alumniPageMeta.keywords,
  alternates: { canonical: alumniPageMeta.path },
};

export default function AlumniPage() {
  const alumniCards = toRacingCards(alumni);

  return (
    <div className="grain min-h-[70vh] bg-[#08080a] text-white">
      <section className="mx-auto max-w-7xl px-5 py-24 md:px-10 md:py-32">
        <Reveal className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">Langtown Racing Academy</Reveal>
        <LineReveal className="display mt-5 text-5xl font-extrabold leading-[0.95] md:text-7xl" lines={["Alumni"]} />
        <Reveal delay={0.15} className="mt-6 max-w-xl text-lg leading-relaxed text-white/55 md:text-xl">
          Former Langtown Racing Academy team members we&apos;re proud to have helped along the way.
        </Reveal>
        {alumniCards.length > 0 ? (
          <RacerGrid racers={alumniCards} />
        ) : (
          <p className="mt-12 text-white/55">Alumni will be added here soon.</p>
        )}
      </section>
    </div>
  );
}

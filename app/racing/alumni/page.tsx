import type { Metadata } from "next";
import RacerGrid from "@/components/RacerGrid";
import { alumni, alumniPageMeta } from "@/lib/content/racing";
import { toRacingCards } from "@/lib/racing-profiles";

export const metadata: Metadata = {
  title: alumniPageMeta.title,
  description: alumniPageMeta.description,
  keywords: alumniPageMeta.keywords,
  alternates: { canonical: alumniPageMeta.path },
};

export default function AlumniPage() {
  const alumniCards = toRacingCards(alumni);

  return (
    <div className="bg-white text-[#1a1a1a]">
      <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <h1 className="text-4xl font-semibold md:text-6xl">Alumni</h1>
        <p className="mt-6 text-lg leading-relaxed text-[#56585e]">
          Former Langtown Racing Academy team members we&apos;re proud to have helped along the way.
        </p>
        {alumniCards.length > 0 ? (
          <RacerGrid racers={alumniCards} />
        ) : (
          <p className="mt-12 text-[#56585e]">
            Alumni will be added here soon.
          </p>
        )}
      </section>
    </div>
  );
}

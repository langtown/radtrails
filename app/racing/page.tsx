import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { featuredRacerDetails, langtownLegacy, racers, racingPageMeta } from "@/lib/content/racing";
import { site } from "@/lib/content/site";

export const metadata: Metadata = {
  title: racingPageMeta.title,
  description: racingPageMeta.description,
  keywords: racingPageMeta.keywords,
  alternates: { canonical: racingPageMeta.path },
};

export default function RacingPage() {
  const featured = racers[0];
  const team = racers.slice(1).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="bg-white text-[#1a1a1a]">
      <section className="relative min-h-[620px] overflow-hidden">
        <Image src="/images/athletes/bobby-langin.jpg" alt="Langtown Racing Academy team" fill priority sizes="100vw" className="object-cover object-center" />
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative mx-auto flex min-h-[620px] max-w-7xl items-center px-4 py-20 md:px-8">
          <div className="max-w-3xl text-white">
            <h1 className="text-4xl font-semibold leading-tight md:text-6xl">Empowering Outdoor Experiences Through Mountain Biking</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed">Meet Langtown Racing Academy and the riders building confidence, character, and racing skill on course.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-20 md:grid-cols-[0.8fr_1.2fr] md:px-8">
        <div className="relative min-h-[460px] overflow-hidden rounded-lg bg-[#dadce0]">
          <Image src={featured.image} alt={featured.name} fill sizes="(min-width: 768px) 40vw, 100vw" className="object-cover object-top" />
        </div>
        <div className="flex flex-col justify-center">
          <h2 className="text-4xl font-semibold md:text-6xl">{featured.name}</h2>
          <p className="mt-5 text-lg leading-relaxed text-[#56585e]">{featured.bio}</p>
          <div className="mt-8 rounded-lg bg-[#f7f7f7] p-6 space-y-3">
            {featuredRacerDetails.map((detail) => (
              <p key={detail} className="text-[#56585e]">{detail}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f7f7f7]">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-8">
          <h2 className="text-4xl font-semibold md:text-6xl">The Team</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {team.map((racer) => (
              <article key={racer.name} className="overflow-hidden rounded-lg bg-white shadow-sm">
                <div className="relative min-h-72 bg-[#dadce0]">
                  {racer.image ? (
                    <Image
                      src={racer.image}
                      alt={racer.name}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                      style={{ objectPosition: racer.imagePosition ?? "center top" }}
                    />
                  ) : (
                    <div className="h-full min-h-72 w-full bg-[#dadce0]" aria-label={`${racer.name} photo placeholder`} />
                  )}
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-semibold">{racer.name}</h3>
                  <p className="mt-4 leading-relaxed text-[#56585e]">{racer.bio}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <div className="grid gap-12 md:grid-cols-[1fr_1fr]">
          <div>
            <h2 className="text-4xl font-semibold md:text-6xl">The Langtown Legacy</h2>
            <div className="mt-6 space-y-5 text-lg leading-relaxed text-[#56585e]">
              {langtownLegacy.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <a href={site.donationUrl} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex min-h-12 items-center rounded-[50px] bg-[#1a1a1a] px-8 text-sm font-semibold text-white transition-colors hover:bg-black">
              Donate
            </a>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="relative min-h-64 overflow-hidden rounded-lg">
              <Image src="/images/athletes/lt-vintage.jpg" alt="Vintage Langtown racing" fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover" />
            </div>
            <div className="relative min-h-64 overflow-hidden rounded-lg">
              <Image src="/images/athletes/lt-justina.jpg" alt="Langtown legacy racing" fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover" />
            </div>
            <div className="relative col-span-2 min-h-72 overflow-hidden rounded-lg">
              <Image src="/images/athletes/lt-turn2.jpg" alt="Langtown turn two" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#f7f7f7]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 md:grid-cols-2 md:px-8">
          <div>
            <h2 className="text-3xl font-semibold">Our Location</h2>
            <p className="mt-4 leading-relaxed text-[#56585e]">
              We serve the Conejo Valley and surrounding Tri-County areas, fostering positive mental health through mountain biking and outdoor recreation in the community.
            </p>
          </div>
          <div className="space-y-4 text-[#56585e]">
            <p>
              <span className="font-semibold text-[#1a1a1a]">Address: </span>
              {site.address}
            </p>
            <p>
              <span className="font-semibold text-[#1a1a1a]">Hours: </span>
              Mon - Fri
            </p>
            <Link href="/support" className="inline-flex min-h-12 items-center rounded-[50px] border border-[#1a1a1a] px-8 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-[#1a1a1a] hover:text-white">
              Contact Ride and Develop
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

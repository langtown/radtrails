import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import RacerGrid from "@/components/RacerGrid";
import Reveal from "@/components/motion/Reveal";
import LineReveal from "@/components/motion/LineReveal";
import ParallaxImage from "@/components/motion/ParallaxImage";
import { featuredRacerDetails, langtownLegacy, racers, racingPageMeta } from "@/lib/content/racing";
import { site } from "@/lib/content/site";
import { getAppRuntime } from "@/lib/db";
import { getCachedPublicProfiles, getDefaultWorkerCache } from "@/lib/public-profiles";
import { buildRacingTeam } from "@/lib/racing-profiles";

export const metadata: Metadata = {
  title: racingPageMeta.title,
  description: racingPageMeta.description,
  keywords: racingPageMeta.keywords,
  alternates: { canonical: racingPageMeta.path },
};

export const dynamic = "force-dynamic";

async function currentOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",", 1)[0].trim();
  const host = forwardedHost || requestHeaders.get("host");
  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return site.domain;

  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",", 1)[0].trim();
  const protocol = forwardedProtocol === "http" ? "http" : "https";
  return `${protocol}://${host}`;
}

export default async function RacingPage() {
  const featured = racers[0];
  const { db, waitUntil } = await getAppRuntime();
  const approvedTeamProfiles = await getCachedPublicProfiles(
    db,
    await currentOrigin(),
    "theteam",
    getDefaultWorkerCache(),
    waitUntil,
  );
  const team = buildRacingTeam(racers, approvedTeamProfiles);

  return (
    <div className="grain bg-[#08080a] text-white">
      <section className="relative flex min-h-[80vh] items-center overflow-hidden">
        <ParallaxImage src="/images/athletes/chinapeak-team-2024.jpg" alt="Langtown Racing Academy team" priority sizes="100vw" strength={50} className="absolute inset-0" imgClassName="opacity-[0.55]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#08080a]/50 via-[#08080a]/25 to-[#08080a]" />
        <div className="relative z-[1] mx-auto w-full max-w-7xl px-5 py-32 md:px-10">
          <Reveal className="eyebrow flex items-center gap-2.5 text-xs uppercase tracking-[0.3em] text-white/55">
            <span className="h-1.5 w-1.5 rounded-full bg-[#a8bd6a]" /> Langtown Racing Academy
          </Reveal>
          <LineReveal
            className="display mt-7 text-[clamp(2.3rem,6.5vw,5.5rem)] font-extrabold leading-[0.98]"
            delay={0.1}
            lines={["Empowering outdoor", <span key="e" className="serif-italic font-light">experiences</span>, "through mountain biking"]}
          />
          <Reveal delay={0.5} className="mt-7 max-w-xl text-lg leading-relaxed text-white/60 md:text-xl">
            Meet Langtown Racing Academy and the riders building confidence, character, and racing skill on course.
          </Reveal>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-20 md:grid-cols-[0.8fr_1.2fr] md:px-10 md:py-28">
        <ParallaxImage src={featured.image} alt={featured.name} sizes="(min-width: 768px) 40vw, 100vw" strength={50} className="relative min-h-[460px] rounded-2xl" imgClassName="object-top" />
        <div className="flex flex-col justify-center">
          <Reveal className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">Featured racer</Reveal>
          <LineReveal trigger="view" delay={0.05} className="display mt-4 text-4xl font-bold leading-[1.0] md:text-6xl" lines={[featured.name]} />
          <Reveal delay={0.15} className="mt-5 text-lg leading-relaxed text-white/60">{featured.bio}</Reveal>
          <Reveal delay={0.2} className="mt-8 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            {featuredRacerDetails.map((detail) => (
              <p key={detail} className="text-white/55">{detail}</p>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-28">
          <Reveal className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">On the start line</Reveal>
          <LineReveal trigger="view" delay={0.05} className="display mt-5 text-4xl font-bold leading-[1.0] md:text-6xl" lines={["The", <span key="t" className="serif-italic font-light">team</span>]} />
          <RacerGrid racers={team} />
        </div>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 md:grid-cols-[1fr_1fr] md:px-10 md:py-28">
          <div>
            <Reveal className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">Heritage</Reveal>
            <LineReveal trigger="view" delay={0.05} className="display mt-5 text-4xl font-bold leading-[1.0] md:text-6xl" lines={["The Langtown", <span key="l" className="serif-italic font-light">legacy</span>]} />
            <Reveal delay={0.15} className="mt-6 space-y-5 text-lg leading-relaxed text-white/55">
              {langtownLegacy.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </Reveal>
            <Reveal delay={0.2}>
              <a href={site.donationUrl} target="_blank" rel="noopener noreferrer" className="group mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-[#08080a] transition-transform duration-300 hover:-translate-y-0.5">
                Donate <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden>→</span>
              </a>
            </Reveal>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ParallaxImage src="/images/athletes/lt-vintage.jpg" alt="Vintage Langtown racing" sizes="(min-width: 768px) 25vw, 50vw" strength={40} className="relative min-h-64 rounded-xl" />
            <ParallaxImage src="/images/athletes/lt-justina.jpg" alt="Langtown legacy racing" sizes="(min-width: 768px) 25vw, 50vw" strength={40} className="relative min-h-64 rounded-xl" />
            <ParallaxImage src="/images/athletes/lt-turn2.jpg" alt="Langtown turn two" sizes="(min-width: 768px) 50vw, 100vw" strength={40} className="relative col-span-2 min-h-72 rounded-xl" />
          </div>
        </div>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 md:grid-cols-2 md:px-10">
          <div>
            <Reveal className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">Find us</Reveal>
            <LineReveal trigger="view" delay={0.05} className="display mt-5 text-3xl font-bold leading-[1.05] md:text-5xl" lines={["Our location"]} />
            <Reveal delay={0.15} className="mt-5 leading-relaxed text-white/55">
              We serve the Conejo Valley and surrounding Tri-County areas, fostering positive mental health through mountain biking and outdoor recreation in the community.
            </Reveal>
          </div>
          <Reveal delay={0.1} className="space-y-4 self-center text-white/55">
            <p>
              <span className="font-semibold text-white">Address: </span>
              {site.address}
            </p>
            <p>
              <span className="font-semibold text-white">Hours: </span>
              Mon - Fri
            </p>
            <Link href="/support" className="inline-flex min-h-12 items-center rounded-full border border-white/25 px-8 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:border-white/60">
              Contact Ride and Develop
            </Link>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { homeGallery, homePageMeta } from "@/lib/content/home";
import { site } from "@/lib/content/site";
import { social } from "@/lib/content/social";
import Reveal from "@/components/motion/Reveal";
import LineReveal from "@/components/motion/LineReveal";
import KineticText from "@/components/motion/KineticText";
import ParallaxImage from "@/components/motion/ParallaxImage";

async function fetchOEmbed(endpoint: string): Promise<string | null> {
  try {
    const res = await fetch(endpoint, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json() as { html?: string };
    return data.html ?? null;
  } catch {
    return null;
  }
}

function instagramOEmbedUrl(postUrl: string) {
  return `https://graph.facebook.com/v21.0/instagram_oembed?url=${encodeURIComponent(postUrl)}&omitscript=true`;
}

function facebookOEmbedUrl(postUrl: string) {
  return `https://graph.facebook.com/v21.0/oembed_post?url=${encodeURIComponent(postUrl)}&omitscript=true`;
}

export const metadata: Metadata = {
  title: homePageMeta.title,
  description: homePageMeta.description,
  keywords: homePageMeta.keywords,
  alternates: { canonical: homePageMeta.path },
};



export default async function Home() {
  const galleryImages = homeGallery;
  const [igEmbeds, fbEmbeds] = await Promise.all([
    Promise.all(social.instagramPosts.map((u) => fetchOEmbed(instagramOEmbedUrl(u)))),
    Promise.all(social.facebookPosts.map((u) => fetchOEmbed(facebookOEmbedUrl(u)))),
  ]);
  const instagramEmbeds = igEmbeds.filter((h): h is string => h !== null);
  const facebookEmbeds = fbEmbeds.filter((h): h is string => h !== null);
  const hasSocial = instagramEmbeds.length > 0 || facebookEmbeds.length > 0;

  return (
    <div className="grain bg-[#08080a] text-white">
      {/* Hero */}
      <section className="relative flex min-h-[100svh] items-center overflow-hidden">
        <ParallaxImage src="/images/home/hero-china-peak.jpg" alt="Ride and Develop mountain bike racing team" priority sizes="100vw" strength={50} className="absolute inset-0" imgClassName="opacity-[0.55]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#08080a]/50 via-[#08080a]/25 to-[#08080a]" />
        <div className="relative z-[1] mx-auto w-full max-w-7xl px-5 py-32 md:px-10">
          <Reveal className="eyebrow flex items-center gap-2.5 text-[11px] uppercase tracking-[0.3em] text-white/55 md:text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-[#a8bd6a]" /> Mountain bike racing · outdoor recreation
          </Reveal>
          <KineticText
            className="display mt-7 text-[clamp(2.6rem,9vw,7.5rem)] font-extrabold leading-[0.9]"
            delay={0.25}
            lines={[
              [{ text: "Enhancing mental" }],
              [{ text: "well-being through" }],
              [{ text: "mountain bike racing", className: "serif-italic font-light" }],
            ]}
          />
          <Reveal delay={0.65} className="mt-8 max-w-xl text-lg leading-relaxed text-white/60 md:text-xl">
            Join us to foster growth and resilience through outdoor experiences and competitive spirit.
          </Reveal>
          <Reveal delay={0.78} className="mt-10 flex flex-wrap items-center gap-6">
            <a href={site.donationUrl} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-[#08080a] transition-transform duration-300 hover:-translate-y-0.5">
              Donate <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden>→</span>
            </a>
            <Link href="/racing" className="group inline-flex items-center gap-2 text-sm font-semibold text-white/80 transition-colors hover:text-white">
              Meet the team <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden>→</span>
            </Link>
          </Reveal>
        </div>
        <div className="float absolute bottom-8 left-1/2 -translate-x-1/2 text-white/35" aria-hidden>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </div>
      </section>

      {/* Marquee ticker */}
      <div className="border-y border-white/10 py-6">
        <div className="marquee overflow-hidden">
          <div className="eyebrow marquee-track flex w-max items-center gap-5 text-xs uppercase tracking-[0.3em] text-white/55">
            {Array.from({ length: 2 }).map((_, dup) => (
              <div key={dup} className="flex items-center gap-5 pr-5" aria-hidden={dup === 1}>
                {["Ride", "Develop", "Race", "Resilience", "Community", "Grow"].map((word) => (
                  <span key={word} className="flex items-center gap-5">
                    <span>{word}</span>
                    <span className="text-[#a8bd6a]/70">/</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Statement */}
      <section className="mx-auto max-w-6xl px-5 py-28 md:px-10 md:py-44">
        <LineReveal
          trigger="view"
          className="display text-[clamp(1.75rem,4.5vw,3.5rem)] font-bold leading-[1.1]"
          lines={[
            "We empower individuals through",
            "mountain bike racing and outdoor",
            <span key="l3">recreation — fostering <span className="serif-italic font-normal text-[#a8bd6a]">personal</span></span>,
            <span key="l4"><span className="serif-italic font-normal text-[#a8bd6a]">growth &amp; resilience</span> in our community.</span>,
          ]}
        />
      </section>

      {/* 01 — Our purpose */}
      <section className="border-t border-white/10">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-20 md:grid-cols-12 md:gap-16 md:px-10 md:py-28">
          <div className="md:col-span-5">
            <Reveal className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">(01) — Our purpose</Reveal>
            <LineReveal trigger="view" delay={0.05} className="display mt-5 text-4xl font-bold leading-[1.0] md:text-6xl" lines={["Our mission", <span key="v" className="serif-italic font-light">& vision</span>]} />
            <Reveal delay={0.15} className="mt-7 max-w-md text-base leading-relaxed text-white/55 md:text-lg">
              We are dedicated to harnessing the transformative power of outdoor experiences to promote mental health, foster confident athletes through teamwork, goal-setting, and perseverance, and guide our members toward fulfilling, passion-driven careers.
            </Reveal>
          </div>
          <ParallaxImage src="/images/home/stage5.jpg" alt="Rider descending a dusty trail" sizes="(min-width: 768px) 58vw, 100vw" strength={60} className="relative aspect-[4/3] rounded-2xl md:col-span-7 md:aspect-[16/11]" />
        </div>
      </section>

      {/* 02 — Our story */}
      <section className="border-t border-white/10">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-20 md:grid-cols-12 md:gap-16 md:px-10 md:py-28">
          <ParallaxImage src="/images/home/gallery/joe-and-mia.jpg" alt="Ride and Develop community members" sizes="(min-width: 768px) 58vw, 100vw" strength={60} className="relative order-2 aspect-[4/3] rounded-2xl md:order-1 md:col-span-7 md:aspect-[16/11]" imgClassName="object-top" />
          <div className="order-1 md:order-2 md:col-span-5">
            <Reveal className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">(02) — Our story</Reveal>
            <LineReveal trigger="view" delay={0.05} className="display mt-5 text-4xl font-bold leading-[1.0] md:text-6xl" lines={["Why", <span key="r" className="serif-italic font-light">we ride</span>]} />
            <Reveal delay={0.15} className="mt-7 max-w-md text-base leading-relaxed text-white/55 md:text-lg">
              Ride and Develop started because we know what a bike can do—turn a tough day around, teach resilience when you crash and get back up, and connect people who might never meet otherwise. We empower stronger minds and capable riders by racing mountain bikes, giving back through trail service, sharing outdoor knowledge, and building a welcoming community where everyone belongs.
            </Reveal>
          </div>
        </div>
      </section>

      {/* 03 — The academy */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-4xl px-5 py-24 text-center md:px-10 md:py-32">
          <Reveal className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">(03) — The academy</Reveal>
          <LineReveal trigger="view" delay={0.05} className="display mt-5 text-4xl font-bold leading-[1.02] md:text-7xl" lines={["Langtown", <span key="a" className="serif-italic font-light">Racing Academy</span>]} />
          <Reveal delay={0.15} className="mx-auto mt-7 max-w-xl text-base leading-relaxed text-white/55 md:text-lg">
            Discover the thrill of competitive racing with our talented team of racers at Langtown Racing Academy. Join us in our journey to excellence on course!
          </Reveal>
          <Reveal delay={0.22} className="mt-9 flex flex-wrap items-center justify-center gap-6">
            <Link href="/support" className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-[#08080a] transition-transform duration-300 hover:-translate-y-0.5">
              Join us <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden>→</span>
            </Link>
            <Link href="/racing" className="group inline-flex items-center gap-2 text-sm font-semibold text-white/80 transition-colors hover:text-white">
              The team <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden>→</span>
            </Link>
          </Reveal>
          <Reveal delay={0.1} className="mt-14 flex justify-center">
            <Image src="/images/home/lta-logo.png" alt="Langtown Racing Academy logo" width={320} height={320} className="h-auto w-48 opacity-90 invert md:w-64" />
          </Reveal>
        </div>
      </section>

      {/* 04 — What we offer */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-28">
          <Reveal className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">(04) — What we offer</Reveal>
          <LineReveal trigger="view" delay={0.05} className="display mt-5 max-w-3xl text-4xl font-bold leading-[1.0] md:text-6xl" lines={["Skill focused", <span key="l" className="serif-italic font-light">learning</span>]} />
          <div className="mt-14 grid gap-5 md:grid-cols-2">
            {[
              {
                title: "Coaching Services",
                body: "Our coaching programs empower individuals to develop skills, confidence, and resilience through mountain biking.",
                href: "/services",
                cta: "View services",
                img: "/images/home/skills-cornering-coaching.jpg",
                alt: "Coaching services on mountain bike trails",
              },
              {
                title: "Community Engagement",
                body: "Join us in fostering teamwork and personal growth through outdoor experiences and competitive racing opportunities.",
                href: "/support",
                cta: "Get involved",
                img: "/images/home/gallery/kern.jpg",
                alt: "Community engagement through riding",
              },
            ].map((card, i) => (
              <Reveal key={card.title} delay={i * 0.1}>
                <Link href={card.href} className="group block overflow-hidden rounded-2xl border border-white/10 transition-colors duration-500 hover:border-white/25">
                  <ParallaxImage src={card.img} alt={card.alt} sizes="(min-width: 768px) 50vw, 100vw" strength={40} className="relative aspect-[16/10]" />
                  <div className="flex items-end justify-between gap-4 p-7 md:p-9">
                    <div>
                      <h3 className="display text-2xl font-bold md:text-3xl">{card.title}</h3>
                      <p className="mt-3 max-w-md text-sm leading-relaxed text-white/55 md:text-base">{card.body}</p>
                    </div>
                    <span className="mb-1 inline-flex h-11 w-11 flex-none items-center justify-center rounded-full border border-white/20 text-lg transition-all duration-300 group-hover:border-white/50 group-hover:bg-white group-hover:text-[#08080a]" aria-hidden>→</span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-28">
          <Reveal className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">(05) — In the field</Reveal>
          <LineReveal trigger="view" delay={0.05} className="display mt-5 text-4xl font-bold leading-[1.0] md:text-6xl" lines={["Gallery"]} />
          {/* Bento that always fills complete rows of 6 columns for 9 photos:
              [4,2] · [2,4] · [2,2,2] · [4,2]. Uniform tile height keeps rows clean. */}
          <div className="mt-14 grid auto-rows-[220px] grid-cols-1 gap-4 sm:grid-cols-2 sm:auto-rows-[240px] md:grid-cols-6 md:auto-rows-[300px]">
            {galleryImages.map((image, i) => {
              const spans = [
                "md:col-span-4",
                "md:col-span-2",
                "md:col-span-2",
                "md:col-span-4",
                "md:col-span-2",
                "md:col-span-2",
                "md:col-span-2",
                "md:col-span-4",
                "md:col-span-2",
              ];
              return (
                <Reveal key={image.src} delay={(i % 3) * 0.08} className={`${spans[i % spans.length]} h-full`}>
                  <div className="group h-full overflow-hidden rounded-xl border border-white/10 transition-colors duration-500 hover:border-white/30">
                    <ParallaxImage src={image.src} alt={image.alt} sizes="(min-width: 768px) 66vw, 100vw" strength={28} className="relative h-full" imgClassName="transition-transform duration-700 ease-out group-hover:scale-105" />
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="relative overflow-hidden border-t border-white/10">
        <ParallaxImage src="/images/home/gallery/kern.jpg" alt="" sizes="100vw" strength={60} className="absolute inset-0" imgClassName="opacity-20" />
        <div className="absolute inset-0 bg-[#08080a]/70" />
        <div className="relative mx-auto max-w-5xl px-5 py-28 text-center md:px-10 md:py-40">
          <LineReveal
            trigger="view"
            className="display text-[clamp(2.2rem,6vw,5rem)] font-extrabold leading-[0.98]"
            lines={["Ready to turn a", <span key="t" className="serif-italic font-light">tough day around?</span>]}
          />
          <Reveal delay={0.2} className="mx-auto mt-7 max-w-xl text-base text-white/60 md:text-lg">
            Ride with us, support the mission, or line up with the team. Everyone belongs here.
          </Reveal>
          <Reveal delay={0.3} className="mt-10 flex flex-wrap items-center justify-center gap-6">
            <a href={site.donationUrl} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-[#08080a] transition-transform duration-300 hover:-translate-y-0.5">
              Donate <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden>→</span>
            </a>
            <Link href="/support" className="group inline-flex items-center gap-2 text-sm font-semibold text-white/80 transition-colors hover:text-white">
              Get involved <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden>→</span>
            </Link>
          </Reveal>
        </div>
      </section>

      {hasSocial && (
        <section className="border-t border-white/10">
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-28">
            <Reveal className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">(06) — Follow along</Reveal>
            <LineReveal trigger="view" delay={0.05} className="display mt-5 text-4xl font-bold leading-[1.0] md:text-6xl" lines={[social.heading]} />
            <Reveal delay={0.15} className="mt-5 max-w-2xl text-base leading-relaxed text-white/55 md:text-lg">{social.description}</Reveal>
            <div className="mt-12 grid gap-10 md:grid-cols-2">
              {instagramEmbeds.length > 0 && (
                <div className="flex flex-col items-center gap-6">
                  {instagramEmbeds.map((html, i) => (
                    <div key={i} className="w-full max-w-sm" dangerouslySetInnerHTML={{ __html: html }} />
                  ))}
                  <a href={social.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[#a8bd6a] hover:text-white">
                    {social.instagramHandle}
                  </a>
                </div>
              )}
              {facebookEmbeds.length > 0 && (
                <div className="flex flex-col items-center gap-6">
                  <div id="fb-root" />
                  {facebookEmbeds.map((html, i) => (
                    <div key={i} className="w-full max-w-sm" dangerouslySetInnerHTML={{ __html: html }} />
                  ))}
                  <a href={social.facebookUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[#a8bd6a] hover:text-white">
                    {social.facebookHandle}
                  </a>
                </div>
              )}
            </div>
            <Script src="https://www.instagram.com/embed.js" strategy="lazyOnload" />
            {facebookEmbeds.length > 0 && (
              <Script src="https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v21.0" strategy="lazyOnload" />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

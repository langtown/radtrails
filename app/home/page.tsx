import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { homeGallery, homePageMeta } from "@/lib/content/home";
import { site } from "@/lib/content/site";
import { social } from "@/lib/content/social";

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
    <div className="bg-white text-[#1d1d1f]">
      <section className="relative min-h-[680px] overflow-hidden">
        <Image src="/images/home/hero-china-peak.jpg" alt="Ride and Develop mountain bike racing team" fill priority sizes="100vw" className="object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-black/40" />
        <div className="relative mx-auto flex min-h-[680px] max-w-7xl flex-col items-center justify-start px-4 pt-20 text-center text-white md:px-8 md:pt-28">
          <h1 className="max-w-4xl text-5xl font-semibold tracking-tight md:text-7xl">
            Enhancing mental well being through mountain bike racing and recreation
          </h1>
          <p className="mt-5 max-w-2xl text-xl font-medium leading-snug tracking-tight md:text-2xl">
            Join us to foster growth and resilience through outdoor experiences and competitive spirit.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xl tracking-tight">
            <a href={site.donationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full bg-[#0071e3] px-6 text-[17px] font-medium text-white transition-colors hover:bg-[#0077ed]">
              Donate
            </a>
            <Link href="/racing" className="text-[#2997ff] hover:underline">
              Meet the team <span aria-hidden>›</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 text-center md:px-8 md:py-28">
        <p className="mx-auto max-w-4xl text-3xl font-semibold leading-snug tracking-tight text-[#1d1d1f] md:text-5xl">
          At Ride and Develop, we empower individuals through mountain bike racing and outdoor recreation, fostering personal growth and resilience in our community.
        </p>
      </section>

      <section className="bg-[#f5f5f7]">
        <div className="mx-auto max-w-5xl px-4 py-24 text-center md:px-8 md:py-28">
          <h2 className="text-4xl font-semibold tracking-tight md:text-6xl">Our Mission and Vision</h2>
          <p className="mx-auto mt-5 max-w-2xl text-xl leading-relaxed tracking-tight text-[#86868b] md:text-2xl">
            We are dedicated to harnessing the transformative power of outdoor experiences to promote mental health, foster confident athletes through teamwork, goal-setting, and perseverance, and guide our members toward fulfilling, passion-driven careers.
          </p>
          <div className="relative mt-12 min-h-[380px] overflow-hidden rounded-[28px] md:min-h-[520px]">
            <Image src="/images/home/stage5.jpg" alt="Rider descending a dusty trail" fill sizes="(min-width: 768px) 60vw, 100vw" className="object-cover object-center" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-24 text-center md:px-8 md:py-28">
        <h2 className="text-4xl font-semibold tracking-tight md:text-6xl">Why we ride</h2>
        <p className="mx-auto mt-5 max-w-2xl text-xl leading-relaxed tracking-tight text-[#86868b] md:text-2xl">
          Ride and Develop started because we know what a bike can do—turn a tough day around, teach resilience when you crash and get back up, and connect people who might never meet otherwise. We empower stronger minds and capable riders by racing mountain bikes, giving back through trail service, sharing outdoor knowledge, and building a welcoming community where everyone belongs.
        </p>
        <div className="relative mt-12 min-h-[380px] overflow-hidden rounded-[28px] md:min-h-[520px]">
          <Image src="/images/home/gallery/joe-and-mia.jpg" alt="Ride and Develop community members" fill sizes="(min-width: 768px) 60vw, 100vw" className="object-cover object-top" />
        </div>
      </section>

      <section className="bg-[#f5f5f7]">
        <div className="mx-auto max-w-5xl px-4 py-24 text-center md:px-8 md:py-28">
          <h2 className="text-4xl font-semibold tracking-tight md:text-6xl">Welcome to Langtown Racing Academy</h2>
          <p className="mx-auto mt-5 max-w-2xl text-xl leading-relaxed tracking-tight text-[#86868b] md:text-2xl">
            Discover the thrill of competitive racing with our talented team of racers at Langtown Racing Academy. Join us in our journey to excellence on course!
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xl tracking-tight">
            <Link href="/support" className="text-[#06c] hover:underline">
              Join us <span aria-hidden>›</span>
            </Link>
            <Link href="/racing" className="text-[#06c] hover:underline">
              The team <span aria-hidden>›</span>
            </Link>
          </div>
          <Image src="/images/home/lta-logo.png" alt="Langtown Racing Academy logo" width={320} height={320} className="mx-auto mt-12 h-auto w-56 md:w-72" />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 md:px-8 md:py-28">
        <div className="text-center">
          <h2 className="text-4xl font-semibold tracking-tight md:text-6xl">Skill Focused Learning</h2>
          <p className="mx-auto mt-5 max-w-2xl text-xl leading-relaxed tracking-tight text-[#86868b] md:text-2xl">
            We provide coaching, training, and support for individuals to thrive in mountain biking and outdoor activities.
          </p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          <article className="overflow-hidden rounded-[28px] bg-[#f5f5f7]">
            <div className="px-8 pt-10 text-center">
              <h3 className="text-2xl font-semibold tracking-tight md:text-3xl">Coaching Services</h3>
              <p className="mx-auto mt-3 max-w-md text-lg leading-relaxed tracking-tight text-[#86868b]">
                Our coaching programs empower individuals to develop skills, confidence, and resilience through mountain biking.
              </p>
              <Link href="/services" className="mt-4 inline-block text-[17px] text-[#06c] hover:underline">
                View services <span aria-hidden>›</span>
              </Link>
            </div>
            <div className="relative mt-8 min-h-80">
              <Image src="/images/home/skills-cornering-coaching.jpg" alt="Coaching services on mountain bike trails" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover object-center" />
            </div>
          </article>
          <article className="overflow-hidden rounded-[28px] bg-[#f5f5f7]">
            <div className="px-8 pt-10 text-center">
              <h3 className="text-2xl font-semibold tracking-tight md:text-3xl">Community Engagement</h3>
              <p className="mx-auto mt-3 max-w-md text-lg leading-relaxed tracking-tight text-[#86868b]">
                Join us in fostering teamwork and personal growth through outdoor experiences and competitive racing opportunities.
              </p>
              <Link href="/support" className="mt-4 inline-block text-[17px] text-[#06c] hover:underline">
                Get involved <span aria-hidden>›</span>
              </Link>
            </div>
            <div className="relative mt-8 min-h-80">
              <Image src="/images/home/gallery/kern.jpg" alt="Community engagement through riding" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover object-center" />
            </div>
          </article>
        </div>
      </section>

      <section className="bg-[#f5f5f7]">
        <div className="mx-auto max-w-7xl px-4 py-24 md:px-8 md:py-28">
          <h2 className="text-center text-4xl font-semibold tracking-tight md:text-6xl">Gallery</h2>
          <p className="mx-auto mt-5 max-w-2xl text-center text-xl leading-relaxed tracking-tight text-[#86868b] md:text-2xl">
            Explore our empowering journey through mountain biking and recreation.
          </p>
          <div className="mx-auto mt-14 grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {galleryImages.map((image) => (
              <div key={image.src} className="relative min-h-[320px] overflow-hidden rounded-[28px] md:min-h-[380px]">
                <Image src={image.src} alt={image.alt} fill loading="lazy" sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover transition-transform duration-500 hover:scale-105" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {hasSocial && (
        <section className="mx-auto max-w-7xl px-4 py-24 md:px-8 md:py-28">
          <h2 className="text-center text-4xl font-semibold tracking-tight md:text-6xl">{social.heading}</h2>
          <p className="mx-auto mt-5 max-w-2xl text-center text-xl leading-relaxed tracking-tight text-[#86868b] md:text-2xl">{social.description}</p>
          <div className="mt-12 grid gap-10 md:grid-cols-2">
            {instagramEmbeds.length > 0 && (
              <div className="flex flex-col items-center gap-6">
                {instagramEmbeds.map((html, i) => (
                  <div key={i} className="w-full max-w-sm" dangerouslySetInnerHTML={{ __html: html }} />
                ))}
                <a href={social.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-[17px] text-[#06c] hover:underline">
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
                <a href={social.facebookUrl} target="_blank" rel="noopener noreferrer" className="text-[17px] text-[#06c] hover:underline">
                  {social.facebookHandle}
                </a>
              </div>
            )}
          </div>
          <Script src="https://www.instagram.com/embed.js" strategy="lazyOnload" />
          {facebookEmbeds.length > 0 && (
            <Script src="https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v21.0" strategy="lazyOnload" />
          )}
        </section>
      )}
    </div>
  );
}

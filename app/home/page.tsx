import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { homeGallery, homePageMeta } from "@/lib/content/home";
import { site } from "@/lib/content/site";

export const metadata: Metadata = {
  title: homePageMeta.title,
  description: homePageMeta.description,
  keywords: homePageMeta.keywords,
  alternates: { canonical: homePageMeta.path },
};



export default function Home() {
  const galleryImages = homeGallery;

  return (
    <div className="bg-white text-[#1a1a1a]">
      <section className="relative min-h-[620px] overflow-hidden">
        <Image src="/images/home/hero-china-peak.jpg" alt="Ride and Develop mountain bike racing team" fill priority sizes="100vw" className="object-cover object-center" />
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative mx-auto flex min-h-[620px] max-w-7xl items-center px-4 py-20 md:px-8">
          <div className="max-w-3xl text-white">
            <h1 className="text-4xl font-semibold leading-tight md:text-6xl">
              Enhancing mental well being through mountain bike racing and recreation
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed md:text-xl">
              Join us to foster growth and resilience through outdoor experiences and competitive spirit.
            </p>
            <a href={site.donationUrl} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex min-h-12 items-center rounded-[50px] bg-[#1a1a1a] px-8 text-sm font-semibold text-white transition-colors hover:bg-black">
              Donate
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <p className="mx-auto max-w-4xl text-center text-xl leading-relaxed text-[#56585e]">
          At Ride and Develop, we empower individuals through mountain bike racing and outdoor recreation, fostering personal growth and resilience in our community.
        </p>

        <div className="mt-20 grid items-center gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold leading-tight md:text-5xl">Our Mission and Vision</h2>
            <p className="mt-5 text-lg leading-relaxed text-[#56585e]">
              We are dedicated to harnessing the transformative power of outdoor experiences to promote mental health, foster confident athletes through teamwork, goal-setting, and perseverance, and guide our members toward fulfilling, passion-driven careers.
            </p>
          </div>
          <div className="relative min-h-[320px] overflow-hidden rounded-lg md:min-h-[440px]">
            <Image src="/images/home/stage5.jpg" alt="Rider descending a dusty trail" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover object-center" />
          </div>
        </div>

        <div className="mt-20 grid items-center gap-10 md:grid-cols-2">
          <div className="relative min-h-[320px] overflow-hidden rounded-lg md:min-h-[440px]">
            <Image src="/images/home/joe-and-mia.jpg" alt="Ride and Develop community members" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover object-top" />
          </div>
          <p className="text-lg leading-relaxed text-[#56585e]">
            Ride and Develop started because we know what a bike can do—turn a tough day around, teach resilience when you crash and get back up, and connect people who might never meet otherwise. We empower stronger minds and capable riders by racing mountain bikes, giving back through trail service, sharing outdoor knowledge, and building a welcoming community where everyone belongs.
          </p>
        </div>
      </section>

      <section className="bg-[#f7f7f7]">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 md:grid-cols-[360px_1fr] md:px-8">
          <Image src="/images/home/lta-logo.png" alt="Langtown Racing Academy logo" width={320} height={320} className="mx-auto h-auto w-64 md:w-80" />
          <div>
            <h2 className="text-3xl font-semibold md:text-5xl">Welcome to Langtown Racing Academy</h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#56585e]">
              Discover the thrill of competitive racing with our talented team of racers at Langtown Racing Academy. Join us in our journey to excellence on course!
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/support" className="inline-flex min-h-12 items-center rounded-[50px] bg-[#1a1a1a] px-8 text-sm font-semibold text-white transition-colors hover:bg-black">
                Join us
              </Link>
              <Link href="/racing" className="inline-flex min-h-12 items-center rounded-[50px] border border-[#1a1a1a] px-8 text-sm font-semibold transition-colors hover:bg-[#1a1a1a] hover:text-white">
                The Team
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <div className="max-w-3xl">
          <h2 className="text-3xl font-semibold md:text-5xl">Skill Focused Learning</h2>
          <p className="mt-5 text-lg leading-relaxed text-[#56585e]">
            We provide coaching, training, and support for individuals to thrive in mountain biking and outdoor activities.
          </p>
        </div>
        <div className="mt-12 grid gap-8 md:grid-cols-2">
          <article className="grid gap-5">
            <div className="relative min-h-80 overflow-hidden rounded-lg">
              <Image src="/images/home/skills-cornering-coaching.jpg" alt="Coaching services on mountain bike trails" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover object-center" />
            </div>
            <h3 className="text-xl font-semibold">Coaching Services</h3>
            <p className="leading-relaxed text-[#56585e]">
              Our coaching programs empower individuals to develop skills, confidence, and resilience through mountain biking.
            </p>
            <Link href="/services" className="font-semibold text-[#1a1a1a] underline underline-offset-4">
              View services
            </Link>
          </article>
          <article className="grid gap-5">
            <div className="relative min-h-80 overflow-hidden rounded-lg">
              <Image src="/images/home/kern.jpg" alt="Community engagement through riding" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover object-center" />
            </div>
            <h3 className="text-xl font-semibold">Community Engagement</h3>
            <p className="leading-relaxed text-[#56585e]">
              Join us in fostering teamwork and personal growth through outdoor experiences and competitive racing opportunities.
            </p>
            <Link href="/support" className="font-semibold text-[#1a1a1a] underline underline-offset-4">
              Get involved
            </Link>
          </article>
        </div>
      </section>

      <section className="bg-[#f7f7f7]">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-8">
          <h2 className="text-center text-3xl font-semibold md:text-5xl">Gallery</h2>
          <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {galleryImages.map((image) => (
              <div key={image.src} className="relative min-h-[320px] overflow-hidden rounded-lg md:min-h-[380px]">
                <Image src={image.src} alt={image.alt} fill loading="lazy" sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover transition-transform duration-300 hover:scale-105" />
              </div>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-2xl text-center text-lg text-[#56585e]">
            Explore our empowering journey through mountain biking and recreation.
          </p>
        </div>
      </section>
    </div>
  );
}

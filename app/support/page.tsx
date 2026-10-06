import type { Metadata } from "next";
import { supportPageMeta } from "@/lib/content/support";
import { site } from "@/lib/content/site";
import Reveal from "@/components/motion/Reveal";
import LineReveal from "@/components/motion/LineReveal";
import ParallaxImage from "@/components/motion/ParallaxImage";

export const metadata: Metadata = {
  title: supportPageMeta.title,
  description: supportPageMeta.description,
  keywords: supportPageMeta.keywords,
  alternates: { canonical: supportPageMeta.path },
};

export default function SupportPage() {
  const contactHref = `mailto:${site.email}?subject=Ride%20and%20Develop%20inquiry`;

  return (
    <div className="grain bg-[#08080a] text-white">
      <section className="relative flex min-h-[80vh] items-center overflow-hidden">
        <ParallaxImage src="/images/support/skills-cornering.jpg" alt="Ride and Develop rider practicing cornering skills" priority sizes="100vw" strength={50} className="absolute inset-0" imgClassName="object-[center_15%] opacity-[0.55]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#08080a]/55 via-[#08080a]/30 to-[#08080a]" />
        <div className="relative z-[1] mx-auto flex w-full max-w-5xl flex-col items-center px-5 py-32 text-center md:px-10">
          <Reveal className="eyebrow flex items-center gap-2.5 text-xs uppercase tracking-[0.3em] text-white/55">
            <span className="h-1.5 w-1.5 rounded-full bg-[#a8bd6a]" /> Support the mission
          </Reveal>
          <LineReveal
            className="display mt-7 text-[clamp(2.4rem,7vw,6rem)] font-extrabold leading-[0.95]"
            delay={0.1}
            lines={["Help us support", <span key="m" className="serif-italic font-light">our mission</span>]}
          />
          <Reveal delay={0.4} className="mt-6 text-lg font-medium text-white/70">You did not come this far to stop.</Reveal>
          <Reveal delay={0.5}>
            <a href={site.donationUrl} target="_blank" rel="noopener noreferrer" className="group mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-[#08080a] transition-transform duration-300 hover:-translate-y-0.5">
              Give now with Givelify <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden>→</span>
            </a>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-20 text-center md:px-10 md:py-28">
        <LineReveal trigger="view" className="display text-3xl font-bold leading-[1.1] md:text-5xl" lines={["Support Ride", <span key="d" className="serif-italic font-light">&amp; Develop</span>]} />
        <Reveal delay={0.15} className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/55">
          Your support helps create access to mountain biking, coaching, racing, trail service, and outdoor recreation for our community.
        </Reveal>
        <Reveal delay={0.2}>
          <a href={site.donationUrl} target="_blank" rel="noopener noreferrer" className="group mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-[#08080a] transition-transform duration-300 hover:-translate-y-0.5">
            Sign Up <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden>→</span>
          </a>
        </Reveal>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 md:grid-cols-[0.9fr_1.1fr] md:px-10 md:py-28">
          <div>
            <Reveal className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">Get in touch</Reveal>
            <LineReveal trigger="view" delay={0.05} className="display mt-5 text-4xl font-bold leading-[1.0] md:text-5xl" lines={["Contact Ride", <span key="c" className="serif-italic font-light">&amp; Develop</span>]} />
            <Reveal delay={0.15} className="mt-5 text-lg leading-relaxed text-white/55">
              Reach out to us for support, inquiries, or to learn more about our programs and how we empower individuals through outdoor recreation.
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <form action={contactHref} method="post" encType="text/plain" className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 md:p-9">
              <div className="grid gap-5">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-white/80">
                    Your first name is required.
                  </label>
                  <input id="name" name="Name" type="text" placeholder="Enter your first name here." className="mt-2 min-h-12 w-full rounded-full border border-white/15 bg-white/5 px-5 text-white outline-none transition-colors placeholder:text-white/55 focus:border-white/40" />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-white/80">
                    Your email address is needed.*
                  </label>
                  <input id="email" name="Email" type="email" placeholder="Enter your email address here." className="mt-2 min-h-12 w-full rounded-full border border-white/15 bg-white/5 px-5 text-white outline-none transition-colors placeholder:text-white/55 focus:border-white/40" />
                </div>
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-white/80">
                    Your message or inquiry.*
                  </label>
                  <textarea id="message" name="Message" rows={6} placeholder="Write your message here." className="mt-2 w-full rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-white outline-none transition-colors placeholder:text-white/55 focus:border-white/40" />
                </div>
                <button type="submit" className="group inline-flex w-fit items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-[#08080a] transition-transform duration-300 hover:-translate-y-0.5">
                  Submit <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden>→</span>
                </button>
              </div>
            </form>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

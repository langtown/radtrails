import type { Metadata } from "next";
import Link from "next/link";
import { coaches, serviceGroups, servicesPageMeta } from "@/lib/content/services";
import Reveal from "@/components/motion/Reveal";
import LineReveal from "@/components/motion/LineReveal";
import ParallaxImage from "@/components/motion/ParallaxImage";

export const metadata: Metadata = {
  title: servicesPageMeta.title,
  description: servicesPageMeta.description,
  keywords: servicesPageMeta.keywords,
  alternates: { canonical: servicesPageMeta.path },
};

const serviceCards = [
  { title: "Private Lessons", intro: null, items: ["Service fee of $150 includes first two hours.", "$75 per each additional hour."] },
  { title: "Group Lessons", intro: "Grab a few friends and learn together.", items: serviceGroups[1].items },
  { title: "Training Programs", intro: serviceGroups[2].intro, items: serviceGroups[2].items },
  { title: "Guided Rides and Clinics", intro: serviceGroups[3].intro, items: serviceGroups[3].items, note: "Clinics: Calendar Coming Soon!" },
];

export default function ServicesPage() {
  return (
    <div className="grain bg-[#08080a] text-white">
      <section className="relative flex min-h-[70vh] items-center overflow-hidden">
        <ParallaxImage src="/images/home/gallery/img-6015.jpg" alt="Riders pausing on a mountain trail" priority sizes="100vw" strength={50} className="absolute inset-0" imgClassName="opacity-[0.55]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#08080a]/50 via-[#08080a]/25 to-[#08080a]" />
        <div className="relative z-[1] mx-auto w-full max-w-7xl px-5 py-32 md:px-10">
          <Reveal className="eyebrow flex items-center gap-2.5 text-xs uppercase tracking-[0.3em] text-white/55">
            <span className="h-1.5 w-1.5 rounded-full bg-[#a8bd6a]" /> Services · coaching · guiding
          </Reveal>
          <LineReveal
            className="display mt-7 text-[clamp(2.4rem,7vw,5.5rem)] font-extrabold leading-[0.95]"
            delay={0.1}
            lines={["Instruction &", <span key="g" className="serif-italic font-light">guide services</span>]}
          />
          <Reveal delay={0.4} className="mt-7 max-w-2xl text-lg leading-relaxed text-white/60 md:text-xl">
            Beyond donations, we offer private and group lessons plus guided riding services across Ventura County, Northern LA County, and now Santa Cruz to help sustain our mission.
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-28">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {serviceCards.map((card, i) => (
            <Reveal key={card.title} delay={i * 0.08}>
              <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition-colors duration-500 hover:border-white/25">
                <h2 className="display text-xl font-bold">{card.title}</h2>
                {card.intro && <p className="mt-4 font-medium text-white/80">{card.intro}</p>}
                <ul className="mt-4 space-y-2 text-sm leading-relaxed text-white/55">
                  {card.items.map((item) => (
                    <li key={item} className="flex gap-2.5">
                      <span className="mt-2 h-1 w-1 flex-none rounded-full bg-[#a8bd6a]" />
                      {item}
                    </li>
                  ))}
                </ul>
                {card.note && <p className="mt-4 text-sm text-white/40">{card.note}</p>}
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1} className="mt-6">
          <div className="grid overflow-hidden rounded-2xl border border-white/10 md:grid-cols-2">
            <div className="flex flex-col justify-center p-10 md:p-14">
              <h2 className="display text-3xl font-bold md:text-4xl">Coaching &amp; training</h2>
              <p className="mt-5 leading-relaxed text-white/55">
                Providing essential coaching and training resources to help individuals excel in mountain biking and recreation.
              </p>
              <Link href="/support" className="group mt-8 inline-flex w-fit items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-[#08080a] transition-transform duration-300 hover:-translate-y-0.5">
                Sign up <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden>→</span>
              </Link>
            </div>
            <ParallaxImage src="/images/home/stage5.jpg" alt="Rider descending a dusty mountain bike trail" sizes="(min-width: 768px) 50vw, 100vw" strength={50} className="relative min-h-[320px]" />
          </div>
        </Reveal>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-28">
          <Reveal className="eyebrow text-xs uppercase tracking-[0.3em] text-[#a8bd6a]">The team behind it</Reveal>
          <LineReveal trigger="view" delay={0.05} className="display mt-5 text-4xl font-bold leading-[1.0] md:text-6xl" lines={["Our", <span key="c" className="serif-italic font-light">coaches</span>]} />

          <article className="mt-16 grid items-center gap-10 md:grid-cols-[1fr_0.95fr]">
            <Reveal>
              <h3 className="display text-3xl font-bold md:text-4xl">{coaches[0].name}</h3>
              <div className="mt-5 space-y-4 text-white/55">
                {coaches[0].bio.map((paragraph) => (
                  <p key={paragraph} className="leading-relaxed">{paragraph}</p>
                ))}
              </div>
              <ul className="mt-6 space-y-2 text-sm font-medium text-white/70">
                {coaches[0].details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            </Reveal>
            <ParallaxImage src={coaches[0].image} alt={coaches[0].name} sizes="(min-width: 768px) 50vw, 100vw" strength={50} className="relative aspect-[4/3] rounded-2xl" />
          </article>

          <div className="mt-20 grid gap-14 md:grid-cols-2">
            {[coaches[1], coaches[3]].map((coach, i) => (
              <Reveal key={coach.name} delay={i * 0.1}>
                <ParallaxImage src={coach.image} alt={coach.name} sizes="(min-width: 768px) 50vw, 100vw" strength={40} className="relative aspect-[3/4] rounded-2xl" imgClassName="object-top" />
                <h3 className="display mt-6 text-2xl font-bold md:text-3xl">{coach.name}</h3>
                <div className="mt-4 space-y-4 text-white/55">
                  {coach.bio.map((paragraph) => (
                    <p key={paragraph} className="leading-relaxed">{paragraph}</p>
                  ))}
                </div>
                {coach.details.length > 0 && (
                  <ul className="mt-5 space-y-2 text-sm font-medium text-white/70">
                    {coach.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                )}
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

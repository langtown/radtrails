import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { coaches, serviceGroups, servicesPageMeta } from "@/lib/content/services";

export const metadata: Metadata = {
  title: servicesPageMeta.title,
  description: servicesPageMeta.description,
  keywords: servicesPageMeta.keywords,
  alternates: { canonical: servicesPageMeta.path },
};

export default function ServicesPage() {
  return (
    <div className="bg-white text-[#1a1a1a]">
      <section className="relative min-h-[620px] overflow-hidden">
        <Image src="/images/home/gallery/img-6015.jpg" alt="Riders pausing on a mountain trail" fill priority sizes="100vw" className="object-cover object-center" />
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative mx-auto flex min-h-[620px] max-w-7xl items-center px-4 py-20 md:px-8">
          <div className="max-w-3xl text-white">
            <h1 className="text-4xl font-semibold leading-tight md:text-6xl">Instruction and Guide Services</h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed md:text-xl">
              Beyond donations, we offer private and group lessons plus guided riding services across Ventura County, Northern LA County, and now Santa Cruz to help sustain our mission.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-28 md:px-8">
        <div className="bg-[#f2f2f2] p-8 md:p-12">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <section className="rounded-lg bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Private Lessons</h2>
              <ul className="mt-5 list-disc space-y-2 pl-5 text-[#1a1a1a]">
                <li>Service fee of $150 includes first two hours.</li>
                <li>$75 per each additional hour.</li>
              </ul>
            </section>

            <section className="rounded-lg bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Group Lessons</h2>
              <p className="mt-4 font-semibold">Grab a few friends and learn together.</p>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-[#1a1a1a]">
                {serviceGroups[1].items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="rounded-lg bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Training Programs</h2>
              <p className="mt-4 font-semibold">{serviceGroups[2].intro}</p>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-[#1a1a1a]">
                {serviceGroups[2].items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="rounded-lg bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Guided Rides and Clinics</h2>
              <p className="mt-4 font-semibold">{serviceGroups[3].intro}</p>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-[#1a1a1a]">
                {serviceGroups[3].items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-4 text-[#56585e]">Clinics: Calendar Coming Soon!</p>
            </section>
          </div>

          <div className="mt-12 grid overflow-hidden bg-white md:grid-cols-2">
            <div className="p-10 md:p-12">
              <h2 className="text-xl font-semibold">Coaching and Training</h2>
              <p className="mt-5 leading-relaxed text-[#56585e]">
                Providing essential coaching and training resources to help individuals excel in mountain biking and recreation.
              </p>
            </div>
            <div className="relative aspect-[4/3]">
              <Image src="/images/home/stage5.jpg" alt="Rider descending a dusty mountain bike trail" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
            </div>
          </div>

          <div className="mt-8 text-center">
            <Link href="/support" className="inline-flex min-h-12 items-center rounded-[50px] bg-[#1a1a1a] px-24 text-sm font-semibold text-white transition-colors hover:bg-black">
              Sign up
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <div className="mb-12 text-center">
          <h2 className="text-4xl font-semibold md:text-6xl">Our Coaches</h2>
        </div>

        <article className="grid items-center gap-10 md:grid-cols-[1fr_0.95fr]">
          <div>
            <h3 className="text-4xl font-semibold">Bobby Langin</h3>
            <div className="mt-4 space-y-4 text-[#56585e]">
              {coaches[0].bio.map((paragraph) => (
                <p key={paragraph} className="leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
            <ul className="mt-5 space-y-2 text-sm font-medium text-[#36344d]">
              {coaches[0].details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden">
            <Image src={coaches[0].image} alt="Bobby Langin" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
          </div>
        </article>

        <div className="mt-20 grid gap-14 md:grid-cols-2">
          {[coaches[1], coaches[3]].map((coach) => (
            <article key={coach.name}>
              <div className="relative aspect-[3/4] overflow-hidden">
                <Image
                  src={coach.image}
                  alt={coach.name}
                  fill
                  sizes="(min-width: 768px) 50vw, 100vw"
                  className="object-cover object-top"
                />
              </div>
              <h3 className="mt-5 text-3xl font-semibold">{coach.name}</h3>
              <div className="mt-4 space-y-4 text-[#56585e]">
                {coach.bio.map((paragraph) => (
                  <p key={paragraph} className="leading-relaxed">
                    {paragraph}
                  </p>
                ))}
              </div>
              {coach.details.length > 0 && (
                <ul className="mt-5 space-y-2 text-sm font-medium text-[#36344d]">
                  {coach.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

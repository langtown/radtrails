import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  conservationContent,
  conservationPageMeta,
} from "@/lib/content/conservation";

export const metadata: Metadata = {
  title: conservationPageMeta.title,
  description: conservationPageMeta.description,
  keywords: conservationPageMeta.keywords,
  alternates: { canonical: conservationPageMeta.path },
};

export default function KeepingItRadPage() {
  return (
    <div className="bg-white text-[#1a1a1a]">
      <section className="relative min-h-[620px] overflow-hidden">
        <Image
          src="/images/home/stage5.jpg"
          alt="Mountain biker riding a local trail"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-black/45" />
        <div className="relative mx-auto flex min-h-[620px] max-w-7xl items-center px-4 py-20 md:px-8">
          <div className="max-w-3xl text-white">
            <p className="text-sm font-semibold uppercase tracking-[0.2em]">
              {conservationContent.eyebrow}
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight md:text-6xl">
              {conservationContent.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed md:text-xl">
              {conservationContent.introduction}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 md:grid-cols-2 md:px-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#56585e]">
            Our approach
          </p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight md:text-5xl">
            Trail Work & Conservancy
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-[#56585e]">
            {conservationContent.mission}
          </p>
          <p className="mt-5 text-lg leading-relaxed text-[#56585e]">
            {conservationContent.commitment}
          </p>
        </div>
        <div className="relative min-h-[360px] overflow-hidden rounded-lg md:min-h-[460px]">
          <Image
            src="/images/home/gallery/trail.jpg"
            alt="A maintained trail winding through the hills"
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover object-center"
          />
        </div>
      </section>

      <section className="bg-[#f7f7f7]">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-8">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-semibold md:text-5xl">
              Caring for trails together
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-[#56585e]">
              Sustainable trails depend on informed, involved communities.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {conservationContent.principles.map((principle) => (
              <article
                key={principle.title}
                className="rounded-lg border border-[#dadce0] bg-white p-7"
              >
                <h3 className="text-2xl font-semibold">{principle.title}</h3>
                <p className="mt-4 leading-relaxed text-[#56585e]">
                  {principle.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 text-center md:px-8">
        <h2 className="text-3xl font-semibold md:text-5xl">Get involved</h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-[#56585e]">
          Connect with Ride and Develop to learn about trail work, community
          events, and local conservation efforts.
        </p>
        <Link
          href="/support"
          className="mt-8 inline-flex min-h-12 items-center rounded-[50px] bg-[#1a1a1a] px-8 text-sm font-semibold text-white transition-colors hover:bg-black"
        >
          Contact us
        </Link>
      </section>
    </div>
  );
}

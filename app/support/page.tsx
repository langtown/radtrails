import type { Metadata } from "next";
import Image from "next/image";
import { supportPageMeta } from "@/lib/content/support";
import { site } from "@/lib/content/site";

export const metadata: Metadata = {
  title: supportPageMeta.title,
  description: supportPageMeta.description,
  keywords: supportPageMeta.keywords,
  alternates: { canonical: supportPageMeta.path },
};

export default function SupportPage() {
  const contactHref = `mailto:${site.email}?subject=Ride%20and%20Develop%20inquiry`;

  return (
    <div className="bg-white text-[#1a1a1a]">
      <section className="relative min-h-[620px] overflow-hidden">
        <Image src="/images/support/skills-cornering.jpg" alt="Ride and Develop rider practicing cornering skills" fill priority sizes="100vw" className="object-cover object-[center_15%]" />
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative mx-auto flex min-h-[620px] max-w-7xl items-center justify-center px-4 py-20 text-center md:px-8">
          <div className="w-full max-w-5xl text-white">
            <h1 className="text-4xl font-semibold leading-tight md:text-6xl">Help us support our mission!</h1>
            <p className="mt-6 text-lg font-semibold">You did not come this far to stop</p>
            <a href={site.donationUrl} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex min-h-12 items-center rounded-[50px] bg-[#1a1a1a] px-8 text-sm font-semibold text-white transition-colors hover:bg-black">
              Give now with Givelify
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 text-center md:px-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-semibold md:text-5xl">Support Ride and Develop</h2>
          <p className="mt-5 text-lg leading-relaxed text-[#56585e]">
            Your support helps create access to mountain biking, coaching, racing, trail service, and outdoor recreation for our community.
          </p>
          <a href={site.donationUrl} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex min-h-12 items-center rounded-[50px] bg-[#1a1a1a] px-8 text-sm font-semibold text-white transition-colors hover:bg-black">
            Sign Up
          </a>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 md:grid-cols-[0.9fr_1.1fr] md:px-8">
          <div>
            <h2 className="text-4xl font-semibold md:text-5xl">Contact Ride and Develop</h2>
            <p className="mt-5 text-lg leading-relaxed text-[#56585e]">
              Reach out to us for support, inquiries, or to learn more about our programs and how we empower individuals through outdoor recreation.
            </p>
          </div>

          <form action={contactHref} method="post" encType="text/plain" className="p-7">
            <div className="grid gap-5">
              <div>
                <label htmlFor="name" className="block text-sm font-semibold">
                  Your first name is required.
                </label>
                <input id="name" name="Name" type="text" placeholder="Enter your first name here." className="mt-2 min-h-12 w-full rounded-[10px] border border-[#b8c0cc] px-4 outline-none focus:border-[#1a1a1a] focus:ring-2 focus:ring-black/10" />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-semibold">
                  Your email address is needed.*
                </label>
                <input id="email" name="Email" type="email" placeholder="Enter your email address here." className="mt-2 min-h-12 w-full rounded-[10px] border border-[#b8c0cc] px-4 outline-none focus:border-[#1a1a1a] focus:ring-2 focus:ring-black/10" />
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-semibold">
                  Your message or inquiry.*
                </label>
                <textarea id="message" name="Message" rows={6} placeholder="Write your message here." className="mt-2 w-full rounded-[10px] border border-[#b8c0cc] px-4 py-3 outline-none focus:border-[#1a1a1a] focus:ring-2 focus:ring-black/10" />
              </div>
              <button type="submit" className="min-h-12 justify-self-start rounded-[50px] bg-[#1a1a1a] px-8 text-sm font-semibold text-white transition-colors hover:bg-black">
                Submit your information now.
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

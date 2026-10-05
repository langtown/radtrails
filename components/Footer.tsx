import { site } from "@/lib/content/site";

export default function Footer() {
  const newsletterHref = `mailto:${site.email}?subject=Join%20the%20Ride%20and%20Develop%20outdoor%20community`;

  return (
    <footer className="border-t border-white/10 bg-[#050507] text-white">
      <div className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-20">
        <p className="display text-4xl font-extrabold leading-[0.95] tracking-tight md:text-6xl">
          Ride. <span className="serif-italic font-light">Develop.</span>
        </p>
        <div className="mt-12 grid gap-10 border-t border-white/10 pt-12 md:grid-cols-[1.2fr_1fr_1.4fr]">
          <div>
            <div className="mb-6 flex gap-5 text-sm">
              <a href={site.social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-white/70 transition-colors hover:text-[#a8bd6a]">
                Facebook
              </a>
              <a href={site.social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-white/70 transition-colors hover:text-[#a8bd6a]">
                Instagram
              </a>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-white/50">{site.tagline}</p>
          </div>

          <div className="space-y-4 text-sm">
            <p className="eyebrow text-xs uppercase tracking-[0.25em] text-[#a8bd6a]">Community</p>
            <a href={`mailto:${site.email}`} className="block text-white/70 transition-colors hover:text-white">
              {site.email}
            </a>
            <a href={site.phoneHref} className="block text-white/70 transition-colors hover:text-white">
              {site.phone}
            </a>
          </div>

          <div className="space-y-4">
            <p className="eyebrow text-xs uppercase tracking-[0.25em] text-[#a8bd6a]">Well-being</p>
            <form action={newsletterHref} method="post" encType="text/plain" className="flex max-w-md flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="newsletter-email">
                Enter your email address
              </label>
              <input
                id="newsletter-email"
                name="Email"
                type="email"
                placeholder="Your email for updates"
                className="min-h-12 flex-1 rounded-full border border-white/15 bg-white/5 px-5 text-white outline-none transition-colors placeholder:text-white/55 focus:border-white/40"
              />
              <button type="submit" className="min-h-12 rounded-full bg-white px-6 text-sm font-semibold text-[#08080a] transition-transform duration-300 hover:-translate-y-0.5">
                Join our community
              </button>
            </form>
          </div>
        </div>

        <p className="mt-12 text-xs text-white/55">© {new Date().getFullYear()} Ride and Develop. All rights reserved.</p>
      </div>
    </footer>
  );
}

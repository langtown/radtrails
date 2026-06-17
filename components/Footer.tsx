import { site } from "@/lib/content/site";

export default function Footer() {
  const newsletterHref = `mailto:${site.email}?subject=Join%20the%20Ride%20and%20Develop%20outdoor%20community`;

  return (
    <footer className="bg-[#4d4d4d] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-[1.2fr_1fr_1.4fr] md:px-8">
        <div>
          <div className="mb-6 flex gap-5">
            <a href={site.social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-white hover:text-[#ebe4ff]">
              Facebook
            </a>
            <a href={site.social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-white hover:text-[#ebe4ff]">
              Instagram
            </a>
          </div>
          <p className="max-w-xs text-sm leading-relaxed">{site.tagline}</p>
        </div>

        <div className="space-y-4 text-sm">
          <p className="font-bold">Community</p>
          <a href={`mailto:${site.email}`} className="block hover:text-[#ebe4ff]">
            {site.email}
          </a>
          <a href={site.phoneHref} className="block hover:text-[#ebe4ff]">
            {site.phone}
          </a>
        </div>

        <div className="space-y-4">
          <p className="font-bold">Well-being</p>
          <form action={newsletterHref} method="post" encType="text/plain" className="flex max-w-md flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="newsletter-email">
              Enter your email address
            </label>
            <input
              id="newsletter-email"
              name="Email"
              type="email"
              placeholder="Your email for updates"
              className="min-h-12 flex-1 rounded-[10px] border border-white/30 bg-white px-4 text-[#0d141a] outline-none focus:border-white focus:ring-2 focus:ring-white/40"
            />
            <button type="submit" className="min-h-12 rounded-[50px] bg-[#1a1a1a] px-6 text-sm font-semibold text-white transition-colors hover:bg-black">
              Join our outdoor community
            </button>
          </form>
        </div>

        <p className="text-sm md:col-span-3">© {new Date().getFullYear()}. All rights reserved.</p>
      </div>
    </footer>
  );
}

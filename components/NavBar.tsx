import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { navItems, site } from "@/lib/content/site";
import AuthNav from "./AuthNav";
import NextRideNav from "./NextRideNav";
import SocialIcon from "./SocialIcon";
import MobileNav from "./MobileNav";

export function NavUtilityArea({ authControls }: { authControls: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      {authControls}
      <span className="mx-1 hidden h-5 w-px bg-white/20 md:block" />
      <a
        href={site.social.facebook}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Facebook"
        className="text-white/70 transition-colors hover:text-[#a8bd6a]"
      >
        <SocialIcon platform="facebook" />
      </a>
      <a
        href={site.social.instagram}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Instagram"
        className="text-white/70 transition-colors hover:text-[#a8bd6a]"
      >
        <SocialIcon platform="instagram" />
      </a>
    </div>
  );
}

export default function NavBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#08080a]/70 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-4 md:px-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center" aria-label="Ride and Develop home">
            <Image src="/images/logo.png" alt="Ride and Develop logo" width={900} height={449} className="h-16 w-auto invert md:h-24" priority />
          </Link>
          <NextRideNav />
        </div>

        {/* Mobile hamburger */}
        <div className="md:hidden">
          <MobileNav navItems={navItems} authControls={<AuthNav />} facebook={site.social.facebook} instagram={site.social.instagram} />
        </div>

        {/* Desktop links */}
        <div className="eyebrow hidden flex-wrap items-center justify-center gap-x-7 gap-y-3 text-xs font-medium uppercase tracking-[0.15em] text-white/70 md:flex">
          {navItems.map((item) =>
            "children" in item && item.children ? (
              <details key={item.href} className="group relative">
                <summary className="flex cursor-pointer list-none items-center gap-1 transition-colors hover:text-white [&::-webkit-details-marker]:hidden">
                  {item.label}
                  <span aria-hidden="true" className="text-[0.6rem] transition-transform group-open:rotate-180">
                    ▾
                  </span>
                </summary>
                <div className="absolute left-0 top-full z-20 mt-3 min-w-[11rem] overflow-hidden rounded-xl border border-white/10 bg-[#101015]/95 py-2 shadow-xl backdrop-blur-xl">
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className="block px-4 py-2.5 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              </details>
            ) : (
              <Link key={item.href} href={item.href} className="transition-colors hover:text-white">
                {item.label}
              </Link>
            ),
          )}
          <NavUtilityArea authControls={<AuthNav />} />
        </div>
      </nav>
    </header>
  );
}

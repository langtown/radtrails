import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { navItems, site } from "@/lib/content/site";
import AuthNav from "./AuthNav";
import NextRideNav from "./NextRideNav";
import SocialIcon from "./SocialIcon";

export function NavUtilityArea({ authControls }: { authControls: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      {authControls}
      <span className="mx-1 hidden h-5 w-px bg-[#dadce0] md:block" />
      <a
        href={site.social.facebook}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Facebook"
        className="text-[#0d141a] transition-colors hover:text-[#673de6]"
      >
        <SocialIcon platform="facebook" />
      </a>
      <a
        href={site.social.instagram}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Instagram"
        className="text-[#0d141a] transition-colors hover:text-[#673de6]"
      >
        <SocialIcon platform="instagram" />
      </a>
    </div>
  );
}

export default function NavBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-[#dadce0] bg-white">
      <nav className="mx-auto flex max-w-7xl flex-col items-center gap-5 px-4 py-5 md:flex-row md:justify-between md:px-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center" aria-label="Ride and Develop home">
            <Image src="/images/logo.png" alt="Ride and Develop logo" width={176} height={151} className="h-24 w-auto md:h-28" priority />
          </Link>
          <NextRideNav />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-[15px] font-medium text-[#0d141a]">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="transition-colors hover:text-[#673de6]">
              {item.label}
            </Link>
          ))}
          <NavUtilityArea authControls={<AuthNav />} />
        </div>
      </nav>
    </header>
  );
}

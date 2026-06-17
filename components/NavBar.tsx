import Image from "next/image";
import Link from "next/link";
import { navItems, site } from "@/lib/content/site";

function SocialIcon({ type }: { type: "facebook" | "instagram" }) {
  if (type === "facebook") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M24 12.073C24 5.444 18.629.073 12 .073S0 5.443 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.386H7.078v-3.468h3.047V9.429c0-3.008 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.251h3.328l-.532 3.468h-2.796v8.386C19.612 23.027 24 18.062 24 12.073Z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 5.838A6.162 6.162 0 1 0 12 18.162 6.162 6.162 0 0 0 12 5.838Zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" />
      <path d="M16.965 5.678a1.44 1.44 0 1 1 2.881 0 1.44 1.44 0 0 1-2.881 0Z" />
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.117.6c-.79.263-1.473.606-2.115 1.248C1.359 2.49 1.017 3.172.754 3.954.488 4.742.287 5.611.227 6.889.04 8.333.024 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.527 2.936.261.787.604 1.459 1.248 2.102.644.643 1.315.986 2.103 1.248.788.266 1.657.467 2.934.527 1.28.058 1.687.072 4.947.072s3.667-.015 4.947-.072c1.28-.06 2.149-.261 2.937-.527.787-.261 1.459-.604 2.102-1.248.643-.644.986-1.315 1.248-2.103.266-.788.467-1.657.527-2.934.058-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.261-2.148-.527-2.936-.261-.787-.604-1.459-1.248-2.102C21.317 1.318 20.646.975 19.859.714c-.788-.266-1.657-.467-2.934-.527C15.667.04 15.26.024 12 0Zm0 2.16c3.203 0 3.585.009 4.849.07 1.171.054 1.805.244 2.227.408.561.217.96.477 1.382.896.419.42.679.819.896 1.38.164.422.354 1.057.408 2.227.061 1.264.07 1.646.07 4.849s-.009 3.585-.07 4.849c-.054 1.171-.244 1.805-.408 2.227-.217.561-.477.96-.896 1.382-.42.419-.819.679-1.38.896-.422.164-1.057.354-2.227.408-1.264.061-1.646.07-4.849.07s-3.585-.009-4.849-.07c-1.171-.054-1.805-.244-2.227-.408-.561-.217-.96-.477-1.382-.896-.419-.42-.679-.819-.896-1.38-.164-.422-.354-1.057-.408-2.227-.061-1.264-.07-1.646-.07-4.849s.009-3.585.07-4.849c.054-1.171.244-1.805.408-2.227.217-.561.477-.96.896-1.382.42-.419.819-.679 1.38-.896.422-.164 1.057-.354 2.227-.408C8.415 2.169 8.797 2.16 12 2.16Z" />
    </svg>
  );
}

export default function NavBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-[#dadce0] bg-white">
      <nav className="mx-auto flex max-w-7xl flex-col items-center gap-5 px-4 py-5 md:flex-row md:justify-between md:px-8">
        <Link href="/" className="flex items-center" aria-label="Ride and Develop home">
          <Image src="/images/logo.png" alt="Ride and Develop logo" width={176} height={151} className="h-24 w-auto md:h-28" priority />
        </Link>

        <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-[15px] font-medium text-[#0d141a]">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="transition-colors hover:text-[#673de6]">
              {item.label}
            </Link>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-[#dadce0] md:block" />
          <a href={site.social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-[#0d141a] transition-colors hover:text-[#673de6]">
            <SocialIcon type="facebook" />
          </a>
          <a href={site.social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-[#0d141a] transition-colors hover:text-[#673de6]">
            <SocialIcon type="instagram" />
          </a>
        </div>
      </nav>
    </header>
  );
}

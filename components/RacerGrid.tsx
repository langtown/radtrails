import Image from "next/image";

import { SOCIAL_LABELS, SOCIAL_PLATFORMS } from "@/lib/profile-constraints";
import type { RacingCard } from "@/lib/racing-profiles";
import SocialIcon from "./SocialIcon";

export default function RacerGrid({ racers }: { racers: readonly RacingCard[] }) {
  return (
    <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {racers.map((racer) => (
        <article key={racer.key} className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors duration-500 hover:border-white/25">
          <div className={`relative min-h-72 overflow-hidden ${!racer.image || racer.image === "/images/logo.png" ? "bg-black" : "bg-white/5"}`}>
            {racer.image && racer.image !== "/images/logo.png" ? (
              <Image
                src={racer.image}
                alt={racer.name}
                fill
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                style={{ objectPosition: racer.imagePosition ?? "center top" }}
                // The image optimizer cannot fetch the dynamic profile image
                // API on the deployed worker (/_next/image 404s); static
                // photos still go through it.
                unoptimized={racer.image.startsWith("/api/")}
              />
            ) : (
              <Image
                src="/images/logo.png"
                alt={`Ride and Develop logo — ${racer.name}`}
                fill
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                className="object-contain p-8 invert"
              />
            )}
          </div>
          <div className="p-6">
            <h3 className="display text-xl font-bold">{racer.name}</h3>
            {racer.bio && (
              <p className="mt-4 whitespace-pre-wrap leading-relaxed text-white/55">
                {racer.bio}
              </p>
            )}
            {racer.sponsors.length > 0 && (
              <div className="mt-5">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-white/55">
                  Sponsors
                </h4>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/55">
                  {racer.sponsors.map((sponsor) => (
                    <li key={sponsor.name}>
                      {sponsor.url ? (
                        <a
                          href={sponsor.url}
                          target="_blank"
                          rel="nofollow noopener noreferrer"
                          className="font-semibold text-[#a8bd6a] underline decoration-1 underline-offset-4"
                        >
                          {sponsor.name}
                        </a>
                      ) : (
                        sponsor.name
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {SOCIAL_PLATFORMS.some((platform) => racer.socials[platform]) && (
              <div className="mt-5">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-white/55">
                  Socials
                </h4>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  {SOCIAL_PLATFORMS.map((platform) => {
                    const url = racer.socials[platform];
                    return url ? (
                      <a
                        key={platform}
                        href={url}
                        target="_blank"
                        rel="nofollow noopener noreferrer"
                        className="inline-flex items-center gap-1.5 font-semibold text-[#a8bd6a] underline decoration-1 underline-offset-4"
                      >
                        <SocialIcon platform={platform} className="h-4 w-4" />
                        {SOCIAL_LABELS[platform]}
                      </a>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

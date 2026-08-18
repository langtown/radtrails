import Image from "next/image";

import { SOCIAL_LABELS, SOCIAL_PLATFORMS } from "@/lib/profile-constraints";
import type { RacingCard } from "@/lib/racing-profiles";
import SocialIcon from "./SocialIcon";

export default function RacerGrid({ racers }: { racers: readonly RacingCard[] }) {
  return (
    <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {racers.map((racer) => (
        <article key={racer.key} className="overflow-hidden rounded-lg bg-white shadow-sm">
          <div className="relative min-h-72 bg-[#dadce0]">
            {racer.image ? (
              <Image
                src={racer.image}
                alt={racer.name}
                fill
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover"
                style={{ objectPosition: racer.imagePosition ?? "center top" }}
              />
            ) : (
              <div
                className="h-full min-h-72 w-full bg-[#dadce0]"
                aria-label={`${racer.name} photo placeholder`}
              />
            )}
          </div>
          <div className="p-6">
            <h3 className="text-xl font-semibold">{racer.name}</h3>
            {racer.bio && (
              <p className="mt-4 whitespace-pre-wrap leading-relaxed text-[#56585e]">
                {racer.bio}
              </p>
            )}
            {racer.sponsors.length > 0 && (
              <div className="mt-5">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-[#56585e]">
                  Sponsors
                </h4>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#56585e]">
                  {racer.sponsors.map((sponsor) => (
                    <li key={sponsor}>{sponsor}</li>
                  ))}
                </ul>
              </div>
            )}
            {SOCIAL_PLATFORMS.some((platform) => racer.socials[platform]) && (
              <div className="mt-5">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-[#56585e]">
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
                        className="inline-flex items-center gap-1.5 font-semibold text-[#5025d1] underline decoration-1 underline-offset-4"
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

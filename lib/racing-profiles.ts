import type { SocialLinks, Sponsor } from "./profile-constraints";
import type { PublicProfile } from "./public-profiles";

type StaticRacer = {
	name: string;
	image: string | null;
	bio: string | null;
	imagePosition?: string | null;
	socials?: SocialLinks;
	sponsors?: Sponsor[];
};

export type RacingCard = StaticRacer & {
	key: string;
	socials: SocialLinks;
	sponsors: Sponsor[];
};

function normalizedName(name: string): string {
	return name.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

/**
 * Turns a checked-in content entry into a card RacerGrid can render — the
 * same manual, no-database path racers all used before dynamic team-member
 * additions existed.
 */
export function toRacingCards(entries: readonly StaticRacer[]): RacingCard[] {
	return entries.map((entry) => ({
		...entry,
		key: `content:${entry.name}`,
		socials: entry.socials ?? {},
		sponsors: entry.sponsors ?? [],
	}));
}

/** Keeps every checked-in racer and appends only newly approved team members. */
export function buildRacingTeam(
	checkedInRacers: readonly StaticRacer[],
	approvedProfiles: readonly PublicProfile[],
): RacingCard[] {
	const checkedInNames = new Set(
		checkedInRacers.map((racer) => normalizedName(racer.name)),
	);
	const checkedInTeam = toRacingCards(checkedInRacers.slice(1));
	const approvedTeam = approvedProfiles
		.filter((profile) => !checkedInNames.has(normalizedName(profile.name)))
		.map((profile) => ({
			key: `profile:${profile.slug}`,
			name: profile.name,
			image: profile.image,
			bio: profile.bio,
			imagePosition: profile.imagePosition,
			socials: profile.socials,
			sponsors: profile.sponsors,
		}));

	return [...checkedInTeam, ...approvedTeam].sort((a, b) =>
		a.name.localeCompare(b.name),
	);
}

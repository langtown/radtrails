import type { SocialLinks } from "./profile-constraints";
import type { PublicProfile } from "./public-profiles";

type StaticRacer = {
	name: string;
	image: string | null;
	bio: string | null;
	imagePosition?: string | null;
	socials?: SocialLinks;
};

export type RacingCard = StaticRacer & {
	key: string;
	socials: SocialLinks;
};

function normalizedName(name: string): string {
	return name.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

/** Keeps every checked-in racer and appends only newly approved team members. */
export function buildRacingTeam(
	checkedInRacers: readonly StaticRacer[],
	approvedProfiles: readonly PublicProfile[],
): RacingCard[] {
	const checkedInNames = new Set(
		checkedInRacers.map((racer) => normalizedName(racer.name)),
	);
	const checkedInTeam = checkedInRacers.slice(1).map((racer) => ({
		...racer,
		key: `content:${racer.name}`,
		socials: racer.socials ?? {},
	}));
	const approvedTeam = approvedProfiles
		.filter((profile) => !checkedInNames.has(normalizedName(profile.name)))
		.map((profile) => ({
			key: `profile:${profile.slug}`,
			name: profile.name,
			image: profile.image,
			bio: profile.bio,
			imagePosition: profile.imagePosition,
			socials: profile.socials,
		}));

	return [...checkedInTeam, ...approvedTeam].sort((a, b) =>
		a.name.localeCompare(b.name),
	);
}

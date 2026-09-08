import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireAdminUser } from "@/lib/persona-admin";

export const metadata: Metadata = {
  title: "Admin guide",
  // An internal tool: keep it out of search results entirely.
  robots: { index: false, follow: false },
};

// Reads the caller's session cookie, so it can never be statically rendered.
export const dynamic = "force-dynamic";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-3 space-y-4 text-[#56585e]">{children}</div>
    </section>
  );
}

export default async function AdminDocsPage() {
  const db = await getDb();

  try {
    const { headers } = await import("next/headers");
    const requestHeaders = await headers();
    await requireAdminUser(
      db,
      new Request("https://radtrails.org/admin/docs", {
        headers: requestHeaders,
      }),
    );
  } catch {
    // Deliberately identical for signed-out and non-admin visitors, so the
    // page never reveals which of the two a visitor is.
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 md:px-8">
        <h1 className="text-3xl font-semibold">Not available</h1>
        <p className="mt-4 text-[#56585e]">
          You do not have access to this page.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[#673de6]">
            Administration
          </p>
          <h1 className="mt-2 text-3xl font-semibold md:text-4xl">
            Admin guide
          </h1>
          <p className="mt-4 max-w-2xl text-[#56585e]">
            How personas and coach calendars work, for anyone administering
            the site.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm font-semibold text-[#5025d1] underline"
        >
          Admin dashboard
        </Link>
      </div>

      <Section title="Personas: who appears where">
        <p>
          A <strong>persona</strong>{" "}describes what kind of person someone is
          within the Rad organization — a team rider, a coach, a friend of
          the project, and so on — and the app uses it to decide whether, and
          where, that person appears on the public site. Every signed-in
          user is automatically given the <code>member</code> persona, plus
          zero or more others — personas are additive, not a single role, so
          the same person can be a featured racer and a coach at once.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Member</strong>{" "}— every account gets this automatically
            on first sign-in. No public presence by default, and a
            member-only account cannot add social links to their profile.
          </li>
          <li>
            <strong>TheTeam</strong>{" "}— appears on the racing page, and is
            expected at the weekend Group Ride. This is also the only
            persona that can be scheduled into a coach&apos;s Intervals
            calendar — see below. Lessons are open to the public, not just
            TheTeam.
          </li>
          <li>
            <strong>Coach</strong>{" "}— appears on the services page, and is the
            only persona that gets a coach calendar (a &quot;Coach
            calendars&quot; card links to it from the dashboard).
          </li>
          <li>
            <strong>Alumni</strong>{" "}— former team members, kept off the
            active racing page.
          </li>
          <li>
            <strong>Admin</strong>{" "}— can grant and revoke personas, review
            pending profile edits, and manage any coach&apos;s calendar on
            their behalf. The system will not let the last admin account be
            removed, so the site can never be left without one.
          </li>
          <li>
            <strong>RadFriends</strong>{" "}— friends of the project. Welcome to
            join TheTeam&apos;s weekend Group Ride and to help out on trail
            days and other excursions, but not part of Intervals, Lessons, or
            Skills. Flagged public in the data model, but the app doesn&apos;t yet
            act on any of this: no page on the site currently lists
            RadFriends, and today&apos;s Group Ride attendee list only
            covers TheTeam holders — granting RadFriends won&apos;t make
            anyone visible, or automatically attending, anywhere yet.
          </li>
          <li>
            <strong>Private</strong>{" "}— an individual who takes private
            Lessons but is not a member of the team. Never shown anywhere on
            the public site. The in-app booking tool doesn&apos;t yet let a
            coach assign a Private persona holder to a Lesson — see below
            (tracked as radtrails-rw8).
          </li>
        </ul>
        <p>
          Grant or revoke personas at{" "}
          <Link
            href="/admin/personas"
            className="font-semibold text-[#5025d1] underline"
          >
            /admin/personas
          </Link>
          , a simple Yes/No toggle per person per persona. Only an existing
          admin can grant personas — the check happens on the server, not
          just in the page.
        </p>
      </Section>

      <Section title="Personas vs. profile content: two separate gates">
        <p>
          Holding a persona is not the same as having your current photo,
          bio, or social links live on the site. That is a second, separate
          gate: a profile&apos;s <strong>status</strong>{" "}(draft, pending,
          approved, or rejected).
        </p>
        <p>
          The public racing and services pages only ever show a
          person&apos;s <strong>last-approved</strong>{" "}version of their
          profile. When someone edits their name, photo, bio, or socials,
          that edit sits as <em>pending</em> — invisible to the public — until
          an admin approves or rejects it at{" "}
          <Link
            href="/admin/profiles"
            className="font-semibold text-[#5025d1] underline"
          >
            /admin/profiles
          </Link>
          . Approving publishes the new version; rejecting sends it back to
          them with a note and leaves whatever was previously approved
          (if anything) exactly as it was — a pending edit can never
          overwrite what is already public.
        </p>
        <p>
          In short: persona decides <em>if</em> someone can appear; profile
          status decides whether <em>this version</em> of their content is
          the one showing.
        </p>
      </Section>

      <Section title="Coach calendars">
        <p>
          Every <code>coach</code> persona holder has a calendar. A coach
          manages their own at <code>/coach</code>; an admin manages any
          coach&apos;s calendar the same way from the &quot;Coach
          calendars&quot; card on the dashboard, at{" "}
          <code>/admin/coaches/[id]</code>. Both surfaces are the identical
          tool — an admin edit behaves exactly like the coach&apos;s own.
        </p>
        <p>
          Everything on a calendar is one of three kinds of entry, all added
          from the same &quot;Add to calendar&quot; form:
        </p>
        <ul className="list-disc space-y-3 pl-5">
          <li>
            <strong>Intervals</strong>{" "}— a standing weekly slot: the same
            rider, same day of week, same time, every week until changed.
            Only <code>theteam</code> persona holders can be assigned as a
            rider, and a slot holds at most two riders (one per bike). Each
            week&apos;s dated session is generated automatically, about eight
            weeks ahead on a rolling basis; rescheduling or cancelling one
            date doesn&apos;t change the underlying weekly rule. Each rider on
            an Intervals slot also gets coach-entered FTP power-zone targets
            (Z1–Z5 watts) and a playlist link the rider sets themselves.
          </li>
          <li>
            <strong>Lessons</strong>{" "}— hourly, 1-on-1 coaching sold to the
            public, not just TheTeam; a team rider can book one too. The{" "}
            <code>private</code>{" "}
            persona is meant for exactly this: someone
            taking Lessons who isn&apos;t on the team. In the app today it
            works like Intervals (one rider per booking, same eligibility
            rules), but scheduled as a specific one-off date instead of a
            recurring weekly slot. Note the gap: the in-app booking tool
            currently only lets a coach or admin assign a{" "}
            <code>theteam</code> holder as the rider, so a{" "}
            <code>private</code>{" "}
            persona holder can&apos;t yet be booked
            through this calendar (tracked as radtrails-rw8).
          </li>
          <li>
            <strong>Group Ride</strong>{" "}(the weekend team ride) — one shared,
            team-wide event: a date, start and finish time, a required
            Google Maps meetup link, and optional free-text notes (route,
            pace, what to bring). Every <code>theteam</code> holder is
            attending by default — nobody has to be added individually. A
            rider opts out by marking themselves &quot;not available&quot;
            from their own profile page. RadFriends are organizationally
            welcome to join too, but the app doesn&apos;t reflect that yet —
            today&apos;s attendee list and opt-out only cover TheTeam
            holders.
          </li>
        </ul>
        <p className="mt-4">
          The team also runs weekly <strong>Skills</strong>{" "}sessions — a
          team-wide activity where TheTeam practices skills together, distinct
          from both the individual, 1-on-1 Lessons and the longer weekend
          Group Ride. The app has no Skills entry today; it isn&apos;t one of
          the three calendar types above (tracked as radtrails-8qj).
        </p>
      </Section>

      <Section title="Booking rules and blackout windows">
        <p>
          A coach can restrict when Intervals and Lessons may be booked, set
          separately for each of the two. <strong>The Group Ride is never
          affected by these rules</strong>{" "}— it&apos;s a team-wide event,
          not a per-rider booking.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Allowed days</strong>{" "}— a weekly on/off toggle per day of
            the week. A day left off can never be booked for that session
            type.
          </li>
          <li>
            <strong>Blackout windows</strong>{" "}— up to two time-of-day ranges
            (e.g. 12:00–13:00) that apply on every allowed day. These are not
            tied to a specific date — they repeat every week until changed.
          </li>
        </ul>
        <p>
          Leaving every day allowed and both blackout windows empty means
          anything can be booked. When a booking would violate one of these
          rules, the app rejects it and explains why (the disallowed day, or
          the specific blackout window it falls in).
        </p>
      </Section>

      <Section title="Calendar subscription (the personal ICS feed)">
        <p>
          Every coach and rider has their own private calendar link — a
          coach sees it on <code>/coach</code>, a rider sees it on their
          profile. It lists that person&apos;s own upcoming Intervals and
          Lessons, plus every Group Ride, so it can be subscribed to in
          Google Calendar, Apple Calendar, or similar.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Copy link</strong>{" "}copies the feed URL to share manually.
          </li>
          <li>
            <strong>Open in calendar app</strong>{" "}hands the link to the
            device&apos;s calendar app directly (via a <code>webcal:</code>{" "}
            link).
          </li>
          <li>
            <strong>Regenerate link</strong>{" "}issues a new secret token and
            immediately invalidates the old URL — use this if a link was
            shared by mistake.
          </li>
        </ul>
        <p>
          This feed is per signed-in account, not per coach — an admin
          managing a coach&apos;s calendar on their behalf does not get that
          coach&apos;s feed link; only the coach&apos;s own sign-in does.
        </p>
      </Section>
    </div>
  );
}

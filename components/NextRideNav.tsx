"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type NextRide = { label: string; eventDate: string; startTime: string };
type NextRideResponse = { rides?: NextRide[]; href?: string };

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "25 Aug-5:00p" — day, three-letter month, and time, so the date is unambiguous. */
function formatRide(eventDate: string, startTime: string): string {
  const date = new Date(`${eventDate}T00:00:00Z`);
  const day = date.getUTCDate();
  const month = MONTHS[date.getUTCMonth()];
  const [hours, minutes] = startTime.split(":").map(Number);
  const meridiem = hours >= 12 ? "p" : "a";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${day} ${month}-${hour12}:${String(minutes).padStart(2, "0")}${meridiem}`;
}

/**
 * The signed-in rider's next few upcoming rides, rendered between the logo
 * and the nav links. Renders nothing when signed out or when nothing is
 * coming.
 */
export default function NextRideNav() {
  const [rides, setRides] = useState<NextRide[]>([]);
  const [href, setHref] = useState("/profile#sessions-calendar");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/next-ride")
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as NextRideResponse;
      })
      .then((body) => {
        if (cancelled) return;
        if (Array.isArray(body?.rides)) setRides(body.rides);
        if (typeof body?.href === "string") setHref(body.href);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (rides.length === 0) return null;

  return (
    <span className="flex flex-col gap-0.5">
      {rides.map((ride, index) => (
        <Link
          key={`${ride.eventDate}T${ride.startTime}-${ride.label}`}
          href={href}
          className="block text-[12px] font-semibold leading-tight text-[#673de6] transition-colors hover:text-[#5025d1]"
        >
          {index === 0 ? "Next ride: " : "Then: "}
          {ride.label} {formatRide(ride.eventDate, ride.startTime)}
        </Link>
      ))}
    </span>
  );
}

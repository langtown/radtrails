"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { getClinicBagCount, subscribeClinicBag } from "@/lib/clinic-cart";

export default function CartNav() {
  const count = useSyncExternalStore(subscribeClinicBag, getClinicBagCount, () => 0);
  if (!count) return null;
  return (
    <Link
      href="/clinics#clinic-bag"
      aria-label={`Shopping cart, ${count} ${count === 1 ? "item" : "items"}`}
      className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:text-[#a8bd6a] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a8bd6a]"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 3h3l3 13h11l3-10H6" />
        <circle cx="9" cy="21" r="1" /><circle cx="18" cy="21" r="1" />
      </svg>
      <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#a8bd6a] px-1 text-[10px] font-bold text-[#08080a]">{count}</span>
    </Link>
  );
}

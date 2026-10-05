"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  children?: readonly { href: string; label: string }[];
};

export default function MobileNav({
  navItems,
  authControls,
  facebook,
  instagram,
}: {
  navItems: readonly NavItem[];
  authControls: ReactNode;
  facebook: string;
  instagram: string;
}) {
  const [open, setOpen] = useState(false);

  // Lock background scroll while the menu is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors hover:text-white"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-[#08080a]/97 backdrop-blur-xl">
          <div className="flex items-center justify-end px-4 py-5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors hover:text-white"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-6 pb-10">
            {navItems.map((item) => (
              <div key={item.href} className="border-b border-white/10 py-2">
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="display block py-3 text-3xl font-bold tracking-tight text-white transition-colors hover:text-[#a8bd6a]"
                >
                  {item.label}
                </Link>
                {item.children && (
                  <div className="mb-2 flex flex-col gap-1 pl-1">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => setOpen(false)}
                        className="eyebrow py-1.5 text-xs uppercase tracking-[0.2em] text-white/55 transition-colors hover:text-white"
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div className="mt-8 flex items-center justify-between">
              <div className="flex items-center gap-4" onClick={() => setOpen(false)}>
                {authControls}
              </div>
              <div className="flex items-center gap-5 text-sm">
                <a href={facebook} target="_blank" rel="noopener noreferrer" className="text-white/70 transition-colors hover:text-[#a8bd6a]">
                  Facebook
                </a>
                <a href={instagram} target="_blank" rel="noopener noreferrer" className="text-white/70 transition-colors hover:text-[#a8bd6a]">
                  Instagram
                </a>
              </div>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

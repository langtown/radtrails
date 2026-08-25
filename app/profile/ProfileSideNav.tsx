"use client";

import { useEffect, useState } from "react";

interface NavItem {
  id: string;
  label: string;
}

interface ProfileSideNavProps {
  items: NavItem[];
}

export default function ProfileSideNav({ items }: ProfileSideNavProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className="hidden xl:block w-44 shrink-0">
      <div className="sticky top-24 space-y-1">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={`block rounded-lg px-3 py-1.5 text-sm transition-colors ${
              activeId === item.id
                ? "bg-[#f0f0f0] font-semibold text-[#1a1a1a]"
                : "text-[#56585e] hover:text-[#1a1a1a]"
            }`}
          >
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

import type { MetadataRoute } from "next";
import { site } from "@/lib/content/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = site.domain.replace(/\/$/, "");
  const now = new Date();
  const routes: { path: string; priority: number }[] = [
    { path: "/", priority: 1 },
    { path: "/services", priority: 0.8 },
    { path: "/racing", priority: 0.8 },
    { path: "/racing/alumni", priority: 0.5 },
    { path: "/community", priority: 0.7 },
    { path: "/support", priority: 0.9 },
    { path: "/privacy", priority: 0.3 },
    { path: "/terms", priority: 0.3 },
  ];
  return routes.map(({ path, priority }) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority,
  }));
}

import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// Makes Cloudflare bindings (DB, IMAGES, ASSETS) available to `next dev`,
// backed by the same local state that `wrangler d1 ... --local` writes to.
// Without this, getCloudflareContext() has no bindings outside `npm run preview`.
initOpenNextCloudflareForDev();

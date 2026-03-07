import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  // Disable the service worker in development to avoid caching stale assets.
  disable: process.env.NODE_ENV === "development",
  register: true,
  // Cache the app shell so it loads instantly on repeat visits.
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  fallbacks: {
    // Serve the offline page when a navigation request fails.
    document: "/offline",
  },
  workboxOptions: {
    skipWaiting: true,
  },
});

const nextConfig: NextConfig = {
  /* config options here */
};

export default withPWA(nextConfig);

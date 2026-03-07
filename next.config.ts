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
  images: {
    // Prefer modern formats for smaller file sizes on all devices.
    formats: ["image/avif", "image/webp"],
    // Allow images served from Supabase Storage.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
  // Serve static assets with aggressive Cache-Control headers from the
  // Vercel Edge Network so repeat visitors never fetch unchanged assets.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Stale-While-Revalidate pattern: serve cached content instantly
          // while updating in the background.
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400",
          },
        ],
      },
      {
        // Immutable static assets produced by Next.js build (hashed filenames).
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);


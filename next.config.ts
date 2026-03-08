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
  async redirects() {
    return [
      {
        source: "/scan",
        destination: "/intake",
        permanent: true,
      },
    ];
  },
  // Silence the Turbopack/webpack conflict from the PWA plugin.
  // Next.js 16 defaults to Turbopack; setting an empty turbopack config
  // acknowledges this and prevents the build error. The `root` is set
  // explicitly to the project directory to suppress the multiple-lockfile
  // warning that occurs when a pnpm-lock.yaml exists outside the project.
  turbopack: {
    root: __dirname,
  },
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
  // Also injects HTTP security headers on every response (Issue #98).
  async headers() {
    // Content Security Policy — limits which resources the browser may load.
    // Scripts/styles are restricted to 'self', Stripe, and Sentry.
    // 'unsafe-inline' is permitted on styles only (required by Tailwind CDN
    // and many UI libraries); nonces or hashes are impractical without SSR
    // per-request nonce injection.
    const csp = [
      "default-src 'self'",
      // Scripts: self, Stripe checkout, Sentry replay bundle
      "script-src 'self' https://js.stripe.com https://browser.sentry-cdn.com",
      // Styles: self + inline (required by Tailwind / shadcn)
      "style-src 'self' 'unsafe-inline'",
      // Images: self, data URIs, Supabase storage, R2 public CDN
      "img-src 'self' data: blob: https://*.supabase.co https://*.r2.dev",
      // Fonts: self only
      "font-src 'self'",
      // XHR / fetch: self, Supabase, Stripe API, Sentry ingestion
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.sentry.io https://*.r2.cloudflarestorage.com",
      // Frames: Stripe uses iframes for secure card fields; block everything else
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      // Workers (service worker / Workbox)
      "worker-src 'self' blob:",
      // Manifest (PWA)
      "manifest-src 'self'",
    ].join("; ");

    const securityHeaders = [
      // Prevent browsers from DNS-prefetching sub-resources (minor privacy win)
      { key: "X-DNS-Prefetch-Control", value: "on" },
      // Enforce HTTPS for 2 years including sub-domains; submit to preload list
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      // Stop browsers from MIME-sniffing the declared content-type
      { key: "X-Content-Type-Options", value: "nosniff" },
      // Block this app from being embedded in a frame (clickjacking defence)
      { key: "X-Frame-Options", value: "DENY" },
      // Send full origin on same-origin requests; only origin on cross-origin
      { key: "Referrer-Policy", value: "origin-when-cross-origin" },
      { key: "Content-Security-Policy", value: csp },
    ];

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
          ...securityHeaders,
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


import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // same-origin blocks the Telegram Login popup. The official library needs this value.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  // Lets the E2E script keep separate production builds per SITE_MODE/PAYMENTS_MODE side by side.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  devIndicators: false,
  productionBrowserSourceMaps: false,
  images: { formats: ["image/avif", "image/webp"] },
  turbopack: {
    // The parent repository has its own lockfile; keep this app self-contained.
    root: __dirname,
  },
  async rewrites() {
    // Browsers ask for /favicon.ico even when app/icon.svg is linked. Serve that icon instead of a 404.
    return [{ source: "/favicon.ico", destination: "/icon.svg" }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
};

export default nextConfig;

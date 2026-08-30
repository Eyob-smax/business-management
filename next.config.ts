import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // A stray lockfile further up the tree makes Next guess the wrong root.
  outputFileTracingRoot: process.cwd(),

  poweredByHeader: false,
  reactStrictMode: true,

  async headers() {
    return [
      {
        // The worker must never be served stale, or a fix can take days to
        // reach an installed phone.
        source: "/sw.js",
        headers: [
          { key: "cache-control", value: "no-cache, no-store, must-revalidate" },
          { key: "service-worker-allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "content-type", value: "application/manifest+json; charset=utf-8" },
          { key: "cache-control", value: "public, max-age=3600" },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [{ key: "cache-control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // Nothing here should be embedded elsewhere or sniffed.
        source: "/:path*",
        headers: [
          { key: "x-content-type-options", value: "nosniff" },
          { key: "x-frame-options", value: "DENY" },
          { key: "referrer-policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);

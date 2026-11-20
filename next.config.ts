import type { NextConfig } from "next";

// Safety instructions sent with every page (audit fix 9, 15 Nov 2026):
// - never show this site inside another website (stops "click-jacking")
// - never guess a file's type from its contents
// - never pass the page address on to other websites
// - no microphone, location or payment features; the camera only for this site
// - always use the secure (https) connection once seen
// The content rule is kept to these safe parts: a full script rule would need
// changes to how Next.js loads its own scripts.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  /* config options here */
  // Hide the development badge so screenshots show what admins will see.
  devIndicators: false,
  // Testing on a phone over home Wi-Fi (development only, ignored on the
  // real website): let the dev server answer this PC's Wi-Fi address.
  allowedDevOrigins: ["192.168.0.237"],
  // Do not announce which software runs the site.
  poweredByHeader: false,
  cacheComponents: true,
  // Item photos (up to 6 MB) and policy PDFs (up to 10 MB, slice P2.5) are
  // sent through the website. The database stores refuse anything larger.
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
  partialPrefetching: true,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

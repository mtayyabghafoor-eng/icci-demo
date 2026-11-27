import type { NextConfig } from "next";

// Safety instructions sent with every page (audit fix 9, 15 Nov 2026):
// - never show this site inside another website (stops "click-jacking")
// - never guess a file's type from its contents
// - never pass the page address on to other websites
// - no microphone, location or payment features; the camera only for this site
// - always use the secure (https) connection once seen
//
// Round C3: a stricter rule on what a page may load. Scripts, styles and
// fonts come only from this site; pictures only from this site, the
// database's file store (photos, receipts) and the browser itself (a photo
// preview, the authenticator QR code); the page talks only to this site.
// Text is never run as code on the real website ("eval"; the development
// server needs it for its error screens). Next.js writes a few small
// scripts into each page itself, so those stay allowed ('unsafe-inline'):
// the stricter way (a new secret code per visit, a "nonce") cannot work
// with the pages drawn in advance (cacheComponents) and would slow every
// page, which the plan rules out.
const isDev = process.env.NODE_ENV === "development";
const fileStore = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();
const CONTENT_RULES = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data:${fileStore ? ` ${fileStore}` : ""}`,
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// E6: a private site. Every reply (pages, pictures, downloads) tells search
// engines not to list it, follow it, keep a copy or show a snippet.
export const KEEP_OUT = "noindex, nofollow, noarchive, nosnippet, noimageindex";

const SECURITY_HEADERS = [
  { key: "X-Robots-Tag", value: KEEP_OUT },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: CONTENT_RULES },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  /* config options here */
  // Hide the development badge so screenshots show what admins will see.
  devIndicators: false,
  // Do not announce which software runs the site.
  poweredByHeader: false,
  cacheComponents: true,
  // Item photos (up to 6 MB) and policy PDFs (up to 10 MB, slice P2.5) are
  // sent through the website, and up to 3 expense receipts of 10 MB each
  // (P5.2). The database stores refuse anything larger.
  experimental: { serverActions: { bodySizeLimit: "32mb" } },
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

// E6: what a phone uses when the site is added to its home screen: the
// round ICCI coin on dark green, and a dark green bar. It opens in the
// ordinary browser ("browser"): no app mode and no offline mode (PLAN.md).
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ICCI Control Dashboard",
    short_name: "ICCI",
    description: "Admin dashboard for the Islamic Cultural Centre of Ireland",
    start_url: "/",
    display: "browser",
    theme_color: "#004236",
    background_color: "#faf8f3",
    icons: [
      { src: "/brand/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}

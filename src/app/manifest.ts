import type { MetadataRoute } from "next";

/**
 * PWA manifest. Served at /manifest.webmanifest.
 *
 * `display: standalone` plus the maskable icons is what makes Android offer
 * "Add to home screen" and then launch without browser chrome - which is the
 * whole point: staff should feel like they opened an app, not a website.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Business Manager - Restaurant & Shop",
    short_name: "Business",
    description:
      "Record sales offline, sync automatically, and see revenue, expenses and profit for the restaurant and the mobile shop.",
    id: "/",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#faf7f2",
    theme_color: "#d97706",
    lang: "en",
    dir: "ltr",
    categories: ["business", "finance", "productivity", "food"],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-48.png", sizes: "48x48", type: "image/png" },
      { src: "/icons/icon-72.png", sizes: "72x72", type: "image/png" },
      { src: "/icons/icon-96.png", sizes: "96x96", type: "image/png" },
      { src: "/icons/icon-128.png", sizes: "128x128", type: "image/png" },
      { src: "/icons/icon-144.png", sizes: "144x144", type: "image/png" },
      { src: "/icons/icon-152.png", sizes: "152x152", type: "image/png" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-256.png", sizes: "256x256", type: "image/png" },
      { src: "/icons/icon-384.png", sizes: "384x384", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Record a sale",
        short_name: "Sell",
        description: "Open the till and ring up an order",
        url: "/staff?source=shortcut",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Today's numbers",
        short_name: "Today",
        description: "Revenue, expenses and profit for today",
        url: "/admin?source=shortcut",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Notes & messages",
        short_name: "Notes",
        description: "Leave a note for the day",
        url: "/notes?source=shortcut",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}

import type { MetadataRoute } from "next";

// PWA manifest. Icons are rendered from public/icon.svg by scripts/make-icons.ts.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Rift Ledger",
    short_name: "Rift Ledger",
    description: "Riftbound collection, portfolio and deck tracker",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbfaf7",
    theme_color: "#fbfaf7",
    categories: ["finance", "games", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Add purchase", url: "/collection/add" },
      { name: "Decks", url: "/decks" },
      { name: "Trade", url: "/trade" },
    ],
  };
}

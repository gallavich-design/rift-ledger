import type { MetadataRoute } from "next";

// Install prompt + icons are polished in Phase 5; the manifest is in place from day one.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rift Ledger",
    short_name: "Rift Ledger",
    description: "Riftbound collection, portfolio and deck tracker",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#fbfaf7",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}

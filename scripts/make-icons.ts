// Usage: npx tsx scripts/make-icons.ts — renders the PWA PNG icons from public/icon.svg.
import { readFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("public/icon.svg", "utf8").trim();
const inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "").replace(/<rect width="512" height="512" rx="96" fill="#fbfaf7"\/>/, "");
// Maskable: full-bleed background, artwork shrunk into the 80% safe zone.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#fbfaf7"/><g transform="translate(76.8 76.8) scale(0.7)">${inner}</g></svg>`;

const jobs: [string, string, number][] = [
  [svg, "public/icons/icon-192.png", 192],
  [svg, "public/icons/icon-512.png", 512],
  [maskable, "public/icons/maskable-512.png", 512],
  [maskable, "public/icons/apple-touch-icon.png", 180],
];
(async () => {
  for (const [src, out, size] of jobs) {
    await sharp(Buffer.from(src)).resize(size, size).png().toFile(out);
    console.log(out);
  }
})();

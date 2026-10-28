// Deck list as a shareable image: every card shown as its art with a ×N badge, in deck order,
// sideboard below — the card-grid layout tournament lists use. Light theme (project rule), drawn on
// the server so card art from other sites can be embedded (a browser canvas can't export those).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { domainColor } from "@/config/domains";
import type { Section } from "./types";

export interface ImageCard {
  cardId: string;
  section: Section;
  quantity: number;
  name: string;
  type: string;
  energy: number | null;
  domains: string[];
  imageUrl: string | null;
  landscape: boolean;
}

export interface DeckImageInput {
  deckName: string;
  legendName: string | null;
  legal: boolean;
  dateLabel: string; // "28 Oct 2026"
  cards: ImageCard[];
}

// Deck order of the grid: Legend, runes, battlefields, chosen champion, then the main deck by cost.
const GRID_ORDER: Section[] = ["LEGEND", "RUNES", "BATTLEFIELDS", "CHAMPION", "MAIN"];

export const IMAGE_WIDTH = 1080;
const COLS = 8;
const GAP = 12;
const PAD = 44;
const FRAME = 5;
const CARD_RATIO = 1039 / 744;

const INK = "#16181d";
const INK2 = "#3d424b";
const INK3 = "#626873";
const PAPER = "#fbfaf7";
const RULE = "#e3e0d8";
const QUILL = "#1f4fb5";

export function orderCards(cards: ImageCard[]) {
  const byCost = (a: ImageCard, b: ImageCard) => (a.energy ?? 99) - (b.energy ?? 99) || a.name.localeCompare(b.name);
  const main = GRID_ORDER.flatMap((s) => cards.filter((c) => c.section === s && c.quantity > 0).sort(s === "MAIN" ? byCost : (a, b) => a.name.localeCompare(b.name)));
  const side = cards.filter((c) => c.section === "SIDEBOARD" && c.quantity > 0).sort(byCost);
  return { main, side };
}

export function layout(mainCount: number, sideCount: number) {
  const tileW = Math.floor((IMAGE_WIDTH - 2 * PAD - (COLS - 1) * GAP) / COLS);
  const artW = tileW - 2 * FRAME;
  const artH = Math.round(artW * CARD_RATIO);
  const tileH = artH + 2 * FRAME;
  const rows = (n: number) => Math.ceil(n / COLS);
  const grid = (n: number) => (n ? rows(n) * tileH + (rows(n) - 1) * GAP : 0);
  const header = 196;
  const sideBlock = sideCount ? 34 + 54 + grid(sideCount) : 0;
  const footer = 70;
  return { tileW, tileH, artW, artH, height: PAD + header + grid(mainCount) + sideBlock + footer };
}

/** Fetches one card image small, as a data URI; sideways art (battlefields) is turned upright. */
async function cardArt(url: string | null, landscape: boolean, width: number): Promise<string | null> {
  if (!url) return null;
  try {
    let src = url;
    if (src.includes("cmsassets.rgpub.io")) src += `${src.includes("?") ? "&" : "?"}w=${landscape ? 520 : 300}&fm=jpg`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(src, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const sharp = (await import("sharp")).default;
    const input = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(input).metadata();
    let img = sharp(input);
    // Turn sideways art upright (some sources already store battlefields upright).
    if ((meta.width ?? 0) > (meta.height ?? 0)) img = img.rotate(90);
    const buf = await img.resize({ width: width * 2 }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

const FONT_DIR = path.join(process.cwd(), "node_modules/@ibm/plex-sans/fonts/complete/woff");
let fonts: { name: string; data: Buffer; weight: 400 | 600 | 700; style: "normal" }[] | null = null;
async function loadFonts() {
  fonts ??= await Promise.all(
    ([
      ["IBMPlexSans-Regular.woff", 400],
      ["IBMPlexSans-SemiBold.woff", 600],
      ["IBMPlexSans-Bold.woff", 700],
    ] as const).map(async ([file, weight]) => ({ name: "Plex", data: await readFile(path.join(FONT_DIR, file)), weight, style: "normal" as const })),
  );
  return fonts;
}

function frameBackground(domains: string[]) {
  const ds = domains.length ? domains : ["Colorless"];
  if (ds.length === 1) return domainColor(ds[0]).solid;
  return `linear-gradient(135deg, ${domainColor(ds[0]).solid} 0%, ${domainColor(ds[0]).solid} 50%, ${domainColor(ds[1]).solid} 50%, ${domainColor(ds[1]).solid} 100%)`;
}

function Tile({ c, art, l }: { c: ImageCard; art: string | null; l: ReturnType<typeof layout> }) {
  return (
    <div style={{ display: "flex", position: "relative", width: l.tileW, height: l.tileH, padding: FRAME, borderRadius: 10, background: frameBackground(c.domains) }}>
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={art} width={l.artW} height={l.artH} style={{ borderRadius: 6, objectFit: "cover" }} alt="" />
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: l.artW, height: l.artH, borderRadius: 6, background: "#ffffff", color: INK2, fontSize: 13, textAlign: "center", padding: 8 }}>{c.name}</div>
      )}
      <div
        style={{
          display: "flex",
          position: "absolute",
          right: 10,
          bottom: 10,
          padding: "1px 9px 3px",
          borderRadius: 6,
          background: "#ffffff",
          border: `1px solid ${RULE}`,
          color: INK,
          fontSize: 19,
          fontWeight: 700,
        }}
      >
        ×{c.quantity}
      </div>
    </div>
  );
}

function Grid({ cards, arts, l }: { cards: ImageCard[]; arts: (string | null)[]; l: ReturnType<typeof layout> }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: GAP, width: IMAGE_WIDTH - 2 * PAD }}>
      {cards.map((c, i) => (
        <Tile key={`${c.section}-${c.cardId}`} c={c} art={arts[i]} l={l} />
      ))}
    </div>
  );
}

export async function renderDeckImage(input: DeckImageInput): Promise<ImageResponse> {
  const { main, side } = orderCards(input.cards);
  const l = layout(main.length, side.length);
  const [mainArt, sideArt, fontData] = await Promise.all([
    mapLimit(main, 8, (c) => cardArt(c.imageUrl, c.landscape, l.artW)),
    mapLimit(side, 8, (c) => cardArt(c.imageUrl, c.landscape, l.artW)),
    loadFonts(),
  ]);
  const count = (s: Section) => input.cards.filter((c) => c.section === s).reduce((a, c) => a + c.quantity, 0);
  const mainDeck = count("MAIN") + count("CHAMPION");
  const summary = [`Main deck ${mainDeck}`, `Runes ${count("RUNES")}`, `Battlefields ${count("BATTLEFIELDS")}`, count("SIDEBOARD") ? `Sideboard ${count("SIDEBOARD")}` : null].filter(Boolean).join("  ·  ");

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: IMAGE_WIDTH, height: l.height, padding: `${PAD}px ${PAD}px 0`, background: PAPER, fontFamily: "Plex", color: INK }}>
        <div style={{ display: "flex", flexDirection: "column", height: 196 }}>
          <div style={{ display: "flex", fontSize: 22, fontWeight: 600, letterSpacing: 1.5, color: QUILL, textTransform: "uppercase" }}>{input.legendName ?? "No Legend"}</div>
          <div style={{ display: "flex", marginTop: 6, fontSize: input.deckName.length > 26 ? 52 : 68, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1.5 }}>{input.deckName}</div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 14, fontSize: 21, color: INK2 }}>
            <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, marginRight: 8, background: input.legal ? "#0b7a43" : "#b42318" }} />
            <span style={{ color: input.legal ? "#0b7a43" : "#b42318", fontWeight: 600, marginRight: 18 }}>{input.legal ? "Legal in Standard" : "Not legal yet"}</span>
            <span>{summary}</span>
          </div>
        </div>
        <Grid cards={main} arts={mainArt} l={l} />
        {side.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", marginTop: 34, borderTop: `2px solid ${RULE}`, paddingTop: 14, height: 54, fontSize: 24, fontWeight: 700, letterSpacing: 1.5, color: INK2 }}>SIDEBOARD</div>
            <Grid cards={side} arts={sideArt} l={l} />
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 70, fontSize: 17, color: INK3 }}>
          <span>Made with Rift Ledger</span>
          <span>{input.dateLabel}</span>
        </div>
      </div>
    ),
    { width: IMAGE_WIDTH, height: l.height, fonts: fontData },
  );
}

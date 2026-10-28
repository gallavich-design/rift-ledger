// Deck list as a shareable image: every card shown as its art with a ×N badge, in deck order,
// sideboard below — the card-grid layout tournament lists use. Always an A4 page (portrait,
// 1240×1754 px = 150 dpi); cards shrink to fit. Drawn on the server so card art from other sites
// can be embedded (a browser canvas can't export those).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { domainColor } from "@/config/domains";
import type { Section } from "./types";
import { parseBackground } from "./imageOptions";
import { FOOTER, GROUP_GAP, GROUP_TITLE, HEADER, PAD, PAGE, fitLayout, groupCards, palette, type DeckImageInput, type ImageCard, type Layout } from "./deckImageLayout";

export type { DeckImageInput, ImageCard };

/** Fetches one card image small, as a data URI; sideways art (battlefields) is turned upright. */
async function cardArt(url: string | null, width: number): Promise<string | null> {
  if (!url) return null;
  try {
    let src = url;
    if (src.includes("cmsassets.rgpub.io")) src += `${src.includes("?") ? "&" : "?"}w=${Math.min(744, width * 3)}&fm=jpg`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(src, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const sharp = (await import("sharp")).default;
    const input = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(input).metadata();
    let img = sharp(input);
    // Turn anticlockwise (name along the right edge) — the way TCGplayer already stores battlefields
    // upright, so cards from either source face the same way.
    if ((meta.width ?? 0) > (meta.height ?? 0)) img = img.rotate(-90);
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
  const [a, b] = [domainColor(ds[0]).solid, domainColor(ds[1]).solid];
  return `linear-gradient(135deg, ${a} 0%, ${a} 50%, ${b} 50%, ${b} 100%)`;
}

function Tile({ c, art, l }: { c: ImageCard; art: string | null; l: Layout }) {
  const r = Math.round(l.tileW * 0.08);
  return (
    <div style={{ display: "flex", position: "relative", width: l.tileW, height: l.tileH, padding: l.frame, borderRadius: r, background: frameBackground(c.domains) }}>
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={art} width={l.artW} height={l.artH} style={{ borderRadius: Math.round(r * 0.6), objectFit: "cover" }} alt="" />
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: l.artW, height: l.artH, borderRadius: Math.round(r * 0.6), background: "#ffffff", color: "#3d424b", fontSize: Math.max(11, Math.round(l.tileW * 0.1)), textAlign: "center", padding: 6 }}>
          {c.name}
        </div>
      )}
      <div
        style={{
          display: "flex",
          position: "absolute",
          right: l.frame * 2,
          bottom: l.frame * 2,
          padding: `0 ${Math.round(l.badge * 0.45)}px ${Math.round(l.badge * 0.12)}px`,
          borderRadius: Math.round(l.badge * 0.32),
          background: "#ffffff",
          border: "1px solid rgba(22,24,29,0.18)",
          color: "#16181d",
          fontSize: l.badge,
          fontWeight: 700,
        }}
      >
        ×{c.quantity}
      </div>
    </div>
  );
}

export async function renderDeckImage(input: DeckImageInput): Promise<ImageResponse> {
  const bg = parseBackground(input.background);
  const pal = palette(bg);
  const groups = groupCards(input.cards, input.grouping ?? "section");
  const l = fitLayout(groups);
  const flat = groups.flatMap((g) => g.cards);
  const [arts, fontData] = await Promise.all([mapLimit(flat, 8, (c) => cardArt(c.imageUrl, l.artW)), loadFonts()]);
  const artOf = new Map(flat.map((c, i) => [`${c.section}|${c.cardId}`, arts[i]]));

  const count = (s: Section) => input.cards.filter((c) => c.section === s).reduce((a, c) => a + c.quantity, 0);
  const summary = [`Main deck ${count("MAIN") + count("CHAMPION")}`, `Runes ${count("RUNES")}`, `Battlefields ${count("BATTLEFIELDS")}`, count("SIDEBOARD") ? `Sideboard ${count("SIDEBOARD")}` : null]
    .filter(Boolean)
    .join("  ·  ");
  const titleSize = input.deckName.length > 30 ? 56 : input.deckName.length > 20 ? 68 : 80;

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: PAGE.width, height: PAGE.height, padding: PAD, background: bg, fontFamily: "Plex", color: pal.ink }}>
        <div style={{ display: "flex", flexDirection: "column", height: HEADER }}>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 600, letterSpacing: 2, color: pal.accent, textTransform: "uppercase" }}>{input.legendName ?? "No Legend"}</div>
          <div style={{ display: "flex", marginTop: 6, fontSize: titleSize, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>{input.deckName}</div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 16, fontSize: 24, color: pal.ink2 }}>
            <div style={{ display: "flex", width: 13, height: 13, borderRadius: 7, marginRight: 9, background: input.legal ? pal.ok : pal.bad }} />
            <span style={{ color: input.legal ? pal.ok : pal.bad, fontWeight: 600, marginRight: 20 }}>{input.legal ? "Legal in Standard" : "Not legal yet"}</span>
            <span>{summary}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
          {groups.map((g, gi) => (
            <div key={gi} style={{ display: "flex", flexDirection: "column", marginTop: gi ? GROUP_GAP : 0 }}>
              {g.title && (
                <div style={{ display: "flex", alignItems: "flex-end", height: GROUP_TITLE, paddingBottom: 12, marginBottom: 0, borderTop: gi ? `2px solid ${pal.rule}` : "none", fontSize: 24, fontWeight: 700, letterSpacing: 2, color: pal.ink2, textTransform: "uppercase" }}>
                  {g.title}
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: l.gap, width: PAGE.width - 2 * PAD }}>
                {g.cards.map((c) => (
                  <Tile key={`${c.section}-${c.cardId}`} c={c} art={artOf.get(`${c.section}|${c.cardId}`) ?? null} l={l} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", height: FOOTER, fontSize: 20, color: pal.ink3 }}>
          <span>Made with Rift Ledger</span>
          <span>{input.dateLabel}</span>
        </div>
      </div>
    ),
    { width: PAGE.width, height: PAGE.height, fonts: fontData },
  );
}

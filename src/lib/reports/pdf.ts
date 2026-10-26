// Renders the value report as a PDF with pdfkit. Fonts: IBM Plex Sans / Mono (OFL, via @fontsource),
// matching the app. Card thumbnails are fetched and downscaled best-effort; a missing image never
// blocks the report.

import path from "node:path";
import PDFDocument from "pdfkit";
import { SOURCE_LABEL } from "@/lib/domain/enums";
import type { ReportData } from "./valueReport";
import { formatStampPlain, money, pct } from "./format";

const FONT_DIR = path.join(process.cwd(), "node_modules/@fontsource");
const FONTS = {
  sans: path.join(FONT_DIR, "ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff"),
  sansMed: path.join(FONT_DIR, "ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff"),
  mono: path.join(FONT_DIR, "ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff"),
};
const INK = "#16181d";
const INK3 = "#626873";
const RULE = "#e3e0d8";
const GAIN = "#0b7a43";
const LOSS = "#b42318";

async function thumb(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const sharp = (await import("sharp")).default;
    return await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: 90 }).jpeg({ quality: 70 }).toBuffer();
  } catch {
    return null;
  }
}

async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

export async function renderReportPdf(r: ReportData, opts: { images?: boolean } = {}): Promise<Buffer> {
  const images = opts.images === false ? r.top.map(() => null) : await mapLimit(r.top, 6, (c) => thumb(c.imageUrl));
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Rift Ledger — collection value report", Creator: "Rift Ledger" }, bufferPages: true });
  doc.registerFont("sans", FONTS.sans);
  doc.registerFont("sansMed", FONTS.sansMed);
  doc.registerFont("mono", FONTS.mono);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  const W = doc.page.width - 96;
  const L = 48;
  const cur = r.display;
  const rule = () => {
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(0.5).strokeColor(RULE).stroke();
    doc.moveDown(0.4);
  };
  const ensure = (h: number) => {
    if (doc.y + h > doc.page.height - 64) doc.addPage();
  };
  const h2 = (t: string) => {
    ensure(60);
    doc.moveDown(1).font("sansMed").fontSize(12).fillColor(INK).text(t, L);
    doc.moveDown(0.3);
    rule();
  };
  /** A table row: columns are [text, width, align, font]. */
  const row = (cols: [string, number, "left" | "right", string?, string?][], size = 8.5, h = 14) => {
    ensure(h);
    const y = doc.y;
    let x = L;
    for (const [t, w, align, font, color] of cols) {
      doc.font(font ?? "sans").fontSize(size).fillColor(color ?? INK).text(t, x, y, { width: w - 6, align, lineBreak: false, ellipsis: true });
      x += w;
    }
    doc.y = y + h;
    doc.x = L;
  };
  const tone = (n: number | null) => (n == null || n === 0 ? INK3 : n > 0 ? GAIN : LOSS);

  // ── Header ──
  doc.font("sans").fontSize(8).fillColor(INK3).text("RIFT LEDGER · COLLECTION VALUE REPORT", L, 48, { characterSpacing: 0.8 });
  doc.moveDown(0.6);
  doc.font("sansMed").fontSize(26).fillColor(INK).text(money(r.totals.value, cur), L);
  doc.font("sans").fontSize(9).fillColor(INK3).text(`Market value · ${r.sourceLabel}${r.latestPriceAt ? ` · prices updated ${formatStampPlain(r.latestPriceAt)}` : ""} · generated ${formatStampPlain(r.generatedAt)} (Bangkok time)`, L);
  doc.moveDown(0.8);
  rule();
  const stats: [string, string, string?][] = [
    ["Cards", money(r.totals.cardsValue, cur)],
    ["Sealed", money(r.totals.sealedValue, cur)],
    ["Cost basis (landed)", money(r.totals.cost, cur)],
    ["Unrealized", `${money(r.totals.unrealized, cur, true)} (${pct(r.totals.unrealizedPct)})`, tone(r.totals.unrealized)],
    ["Realized", money(r.totals.realized, cur, true), tone(r.totals.realized)],
  ];
  const sw = W / stats.length;
  const sy = doc.y;
  stats.forEach(([k, v, c], i) => {
    doc.font("sans").fontSize(7.5).fillColor(INK3).text(k.toUpperCase(), L + i * sw, sy, { width: sw - 8, characterSpacing: 0.5 });
    doc.font("mono").fontSize(9.5).fillColor(c ?? INK).text(v, L + i * sw, sy + 12, { width: sw - 8 });
  });
  doc.y = sy + 34;
  doc.x = L;
  doc.font("sans").fontSize(7.5).fillColor(INK3).text(
    `${r.totals.copies} cards in ${r.totals.positions} positions${r.totals.unpricedPositions ? `, ${r.totals.unpricedPositions} without a price (not in the value)` : ""}. Values in ${cur}${r.fx.length ? `; FX ${r.fx.map((f) => `1 USD = ${f.rate.toFixed(4)} ${f.quote} (${f.note})`).join("; ")}` : ""}.`,
    L,
    doc.y,
    { width: W },
  );

  // ── By set ──
  h2("Totals by set");
  const setCols = [W * 0.46, W * 0.12, W * 0.21, W * 0.21];
  row([["Set", setCols[0], "left", "sansMed", INK3], ["Copies", setCols[1], "right", "sansMed", INK3], ["Value", setCols[2], "right", "sansMed", INK3], ["Cost basis", setCols[3], "right", "sansMed", INK3]], 7.5);
  for (const s of r.bySet) row([[`${s.setCode}  ${s.setName}`, setCols[0], "left"], [String(s.copies), setCols[1], "right", "mono"], [money(s.value, cur), setCols[2], "right", "mono"], [money(s.cost, cur), setCols[3], "right", "mono"]]);
  if (r.sealed.length) row([["Sealed product", setCols[0], "left"], [String(r.sealed.reduce((a, s) => a + s.quantity, 0)), setCols[1], "right", "mono"], [money(r.totals.sealedValue, cur), setCols[2], "right", "mono"], [money(r.totals.sealedCost, cur), setCols[3], "right", "mono"]]);
  rule();
  row([["Total", setCols[0], "left", "sansMed"], ["", setCols[1], "right"], [money(r.totals.value, cur), setCols[2], "right", "mono"], [money(r.totals.cost, cur), setCols[3], "right", "mono"]]);

  // ── Top 50 ──
  h2(`Top ${r.top.length} cards by value`);
  const tc = [26, W * 0.4 - 26, W * 0.08, W * 0.16, W * 0.17, W * 0.19];
  r.top.forEach((c, i) => {
    const h = 38;
    ensure(h + 2);
    const y = doc.y;
    const img = images[i];
    if (img) {
      try {
        doc.image(img, L, y, { height: h - 4 });
      } catch {
        /* unsupported image — skip */
      }
    } else doc.rect(L, y, 24, h - 4).fillColor("#f3f1ec").fill();
    const x0 = L + tc[0] + 4;
    doc.font("sansMed").fontSize(8.5).fillColor(INK).text(`${i + 1}. ${c.name}`, x0, y + 2, { width: tc[1] - 8, lineBreak: false, ellipsis: true });
    doc.font("mono").fontSize(7).fillColor(INK3).text([`${c.setCode}·${String(c.number ?? "").padStart(3, "0")}`, c.printing, c.finish, c.language !== "EN" ? c.language : null, c.graded].filter(Boolean).join(" · "), x0, y + 14, { width: tc[1] - 8, lineBreak: false, ellipsis: true });
    doc.font("sans").fontSize(6.5).fillColor(INK3).text(`${c.source ? (SOURCE_LABEL[c.source] ?? c.source) : "no price"}${c.priceAsOf ? ` · ${formatStampPlain(c.priceAsOf)}` : ""}`, x0, y + 24, { width: tc[1] - 8, lineBreak: false, ellipsis: true });
    let x = L + tc[0] + tc[1];
    for (const [t, w, col] of [
      [`×${c.quantity}`, tc[2], INK],
      [money(c.unit, cur), tc[3], INK],
      [money(c.value, cur), tc[4], INK],
      [c.pl == null ? "—" : money(c.pl, cur, true), tc[5], tone(c.pl)],
    ] as [string, number, string][]) {
      doc.font("mono").fontSize(8).fillColor(col).text(t, x, y + 2, { width: w - 6, align: "right", lineBreak: false });
      x += w;
    }
    doc.y = y + h;
    doc.x = L;
  });

  // ── Graded ──
  h2("Graded cards");
  if (!r.graded.length) doc.font("sans").fontSize(8.5).fillColor(INK3).text("No graded cards.", L);
  else {
    const gc = [W * 0.44, W * 0.16, W * 0.1, W * 0.15, W * 0.15];
    for (const c of r.graded) row([[`${c.name} · ${c.setCode}·${String(c.number ?? "").padStart(3, "0")}`, gc[0], "left"], [c.graded ?? "", gc[1], "left", "mono"], [`×${c.quantity}`, gc[2], "right", "mono"], [money(c.value, cur), gc[3], "right", "mono"], [money(c.cost, cur), gc[4], "right", "mono"]]);
  }

  // ── Sealed ──
  h2("Sealed products");
  if (!r.sealed.length) doc.font("sans").fontSize(8.5).fillColor(INK3).text("No sealed product held.", L);
  else {
    const sc = [W * 0.38, W * 0.08, W * 0.17, W * 0.17, W * 0.2];
    for (const s of r.sealed) {
      row([[`${s.name} (${s.kind})`, sc[0], "left"], [`×${s.quantity}`, sc[1], "right", "mono"], [money(s.unit, cur), sc[2], "right", "mono"], [money(s.value, cur), sc[3], "right", "mono"], [money(s.cost, cur), sc[4], "right", "mono"]], 8.5, 12);
      row([[`${s.source ? (SOURCE_LABEL[s.source] ?? s.source) : "No price"}${s.priceAsOf ? ` · ${formatStampPlain(s.priceAsOf)}` : ""}`, W, "left", "sans", INK3]], 6.5, 12);
    }
  }

  // ── Footer on every page ──
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font("sans").fontSize(7).fillColor(INK3).text(`Rift Ledger · ${r.sourceLabel} · page ${i + 1} of ${range.count}`, L, doc.page.height - 36, { width: W, align: "center", lineBreak: false });
  }
  doc.end();
  return done;
}

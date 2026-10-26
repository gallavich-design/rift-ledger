// Matches import rows to catalogue printings. Order of evidence: set + collector number, then exact
// card name, then a fuzzy name match (typos) — the preview says which one was used so you can check it.
// Never invents a printing: rows that don't match anything are reported and skipped.

import type { PrismaClient } from "@prisma/client";
import { normalizeForSearch } from "@/lib/catalog/grouping";
import { getSearchIndex, rankSearchScored } from "@/lib/catalog/search";
import { ART_LABEL, type VariantArt } from "@/lib/domain/enums";
import type { ImportRow } from "./rows";

export type MatchStatus = "exact" | "chosen" | "fuzzy" | "missing" | "invalid";

export interface ResolvedRow extends ImportRow {
  status: MatchStatus;
  variantId: string | null;
  label: string | null; // "Jinx - Rebel · OGN·202 · Standard · Foil"
  note: string | null; // why a printing was chosen, or what's wrong
}

interface V {
  id: string;
  cardId: string;
  name: string;
  setCode: string;
  setRelease: number;
  cardSetCode: string;
  number: number | null;
  art: string;
  finish: string;
  language: string;
}

const ART_WORDS: Record<string, VariantArt> = {
  standard: "STANDARD", base: "STANDARD", normal: "STANDARD",
  alternate: "ALTERNATE", "alternate art": "ALTERNATE", alt: "ALTERNATE", "alt art": "ALTERNATE",
  overnumbered: "OVERNUMBERED", "over numbered": "OVERNUMBERED", showcase: "OVERNUMBERED",
  signature: "SIGNATURE", signed: "SIGNATURE",
  promo: "PROMO", metal: "METAL",
};

function artOf(text: string | null): VariantArt | null | "bad" {
  if (!text) return null;
  const t = normalizeForSearch(text);
  return ART_WORDS[t] ?? (Object.entries(ART_LABEL).find(([, l]) => normalizeForSearch(l) === t)?.[0] as VariantArt | undefined) ?? "bad";
}

const label = (v: V) => `${v.name} · ${v.setCode}·${String(v.number ?? "").padStart(3, "0")} · ${ART_LABEL[v.art as VariantArt] ?? v.art} · ${v.finish === "FOIL" ? "Foil" : "Normal"}${v.language !== "EN" ? ` · ${v.language}` : ""}`;

/** Best default among several printings of the same card: base art, normal finish, the card's own set. */
function preferBase(vs: V[], finish: ImportRow["finish"]): V[] {
  const rank = (v: V) =>
    (v.art === "STANDARD" ? 0 : v.art === "PROMO" ? 2 : 1) * 100 +
    (finish ? (v.finish === finish ? 0 : 50) : v.finish === "NORMAL" ? 0 : 10) +
    (v.setCode === v.cardSetCode ? 0 : 5);
  return [...vs].sort((a, b) => rank(a) - rank(b) || a.setRelease - b.setRelease || (a.number ?? 0) - (b.number ?? 0));
}

export async function resolveRows(db: PrismaClient, rows: ImportRow[]): Promise<ResolvedRow[]> {
  const raw = await db.cardVariant.findMany({
    where: { gradingCompany: null },
    select: { id: true, cardId: true, collectorNumber: true, art: true, finish: true, language: true, card: { select: { name: true, set: { select: { code: true } } } }, set: { select: { code: true, releaseDate: true } } },
  });
  const all: V[] = raw.map((v) => ({
    id: v.id,
    cardId: v.cardId,
    name: v.card.name,
    setCode: v.set.code,
    setRelease: v.set.releaseDate?.getTime() ?? 0,
    cardSetCode: v.card.set.code,
    number: v.collectorNumber,
    art: v.art,
    finish: v.finish,
    language: v.language,
  }));
  const bySetNum = new Map<string, V[]>();
  const byName = new Map<string, V[]>();
  for (const v of all) {
    const k = `${v.setCode}|${v.number}`;
    bySetNum.set(k, [...(bySetNum.get(k) ?? []), v]);
    const n = normalizeForSearch(v.name);
    byName.set(n, [...(byName.get(n) ?? []), v]);
  }
  const index = await getSearchIndex(db);

  return rows.map((r): ResolvedRow => {
    const base = { ...r, variantId: null, label: null };
    if (r.errors.length) return { ...base, status: "invalid", note: r.errors.join("; ") };
    const lang = r.language ?? "EN";
    const art = artOf(r.printing);
    if (art === "bad") return { ...base, status: "invalid", note: `Printing "${r.printing}" — use Standard, Alternate art, Overnumbered, Signature, Promo or Metal` };

    let pool: V[] = [];
    let status: MatchStatus = "exact";
    const notes: string[] = [];

    if (r.setCode && r.number != null) {
      pool = bySetNum.get(`${r.setCode}|${r.number}`) ?? [];
      if (!pool.length) return { ...base, status: "missing", note: `No card ${r.setCode}·${String(r.number).padStart(3, "0")} in the catalogue` };
      if (r.name && !pool.some((v) => normalizeForSearch(v.name) === normalizeForSearch(r.name!))) notes.push(`number says ${pool[0].name}, not "${r.name}" — using the number`);
    } else if (r.name) {
      pool = byName.get(normalizeForSearch(r.name)) ?? [];
      if (!pool.length) {
        const hit = rankSearchScored(index, r.name, 2)[0];
        if (!hit) return { ...base, status: "missing", note: `No card called "${r.name}"` };
        pool = all.filter((v) => v.cardId === hit.doc.id);
        status = "fuzzy";
        notes.push(`"${r.name}" read as ${hit.doc.name}`);
      }
      if (r.setCode) {
        const inSet = pool.filter((v) => v.setCode === r.setCode);
        if (inSet.length) pool = inSet;
        else notes.push(`not printed in ${r.setCode}`);
      }
    }

    // Narrow by language, printing and finish.
    const byLang = pool.filter((v) => v.language === lang);
    if (!byLang.length) return { ...base, status: "missing", note: `No ${lang} printing in the catalogue — add the variant on the card page first` };
    pool = byLang;
    if (art) {
      const a = pool.filter((v) => v.art === art);
      if (!a.length) return { ...base, status: "missing", note: `No ${ART_LABEL[art]} printing of ${pool[0].name}${r.setCode ? ` in ${r.setCode}` : ""}` };
      pool = a;
    }
    if (r.finish) {
      const f = pool.filter((v) => v.finish === r.finish);
      if (f.length) pool = f;
      else notes.push(`only ${pool[0].finish === "FOIL" ? "foil" : "normal"} exists — used that`);
    }
    const ordered = preferBase(pool, r.finish);
    const pick = ordered[0];
    if (new Set(pool.map((v) => v.id)).size > 1 && status === "exact") {
      status = "chosen";
      notes.push(`${pool.length} printings — picked ${ART_LABEL[pick.art as VariantArt] ?? pick.art}, ${pick.finish === "FOIL" ? "foil" : "normal"}${pick.setCode !== pick.cardSetCode ? ` (${pick.setCode})` : ""}; add set + number to choose`);
    }
    return { ...base, status, variantId: pick.id, label: label(pick), note: notes.join("; ") || null };
  });
}

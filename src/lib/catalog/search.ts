// Typo-tolerant card search over the local cache (never hits the network per keystroke).
// Fuse.js handles misspellings; an exact/prefix pass ranks obvious hits first.

import Fuse from "fuse.js";
import type { PrismaClient } from "@prisma/client";
import { normalizeForSearch } from "./grouping";

export interface SearchDoc {
  id: string;
  name: string;
  searchName: string;
  type: string;
  supertype: string | null;
  domains: string;
  tags: string;
  imageUrl: string | null;
  setCode: string;
}

let index: { fuse: Fuse<SearchDoc>; docs: SearchDoc[] } | null = null;

export function invalidateSearchIndex() {
  index = null;
}

export function buildIndex(docs: SearchDoc[]) {
  const fuse = new Fuse(docs, {
    keys: [
      { name: "searchName", weight: 0.8 },
      { name: "tags", weight: 0.2 },
    ],
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.42,
    minMatchCharLength: 2,
  });
  return { fuse, docs };
}

async function getIndex(db: PrismaClient) {
  if (index) return index;
  const cards = await db.card.findMany({
    select: {
      id: true,
      name: true,
      searchName: true,
      type: true,
      supertype: true,
      domains: true,
      tags: true,
      imageUrl: true,
      set: { select: { code: true } },
    },
  });
  index = buildIndex(cards.map(({ set, tags, ...c }) => ({ ...c, tags: tags.replaceAll("|", " "), setCode: set.code })));
  return index;
}

export function rankSearch(idx: { fuse: Fuse<SearchDoc>; docs: SearchDoc[] }, query: string, limit = 20): SearchDoc[] {
  const q = normalizeForSearch(query);
  if (!q) return [];
  const tokens = q.split(" ");
  // Pass 1: every query token is a prefix of some word in the name (handles "yi honed").
  const direct = idx.docs
    .filter((d) => {
      const words = d.searchName.split(" ");
      return tokens.every((t) => words.some((w) => w.startsWith(t)));
    })
    .sort((a, b) => Number(b.searchName === q) - Number(a.searchName === q) || a.name.length - b.name.length);
  // Pass 2: fuzzy, for typos.
  const fuzzy = idx.fuse.search(q, { limit: limit * 2 }).map((r) => r.item);
  const seen = new Set<string>();
  const out: SearchDoc[] = [];
  for (const d of [...direct, ...fuzzy]) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    out.push(d);
    if (out.length >= limit) break;
  }
  return out;
}

export async function searchCards(db: PrismaClient, query: string, limit = 20) {
  return rankSearch(await getIndex(db), query, limit);
}

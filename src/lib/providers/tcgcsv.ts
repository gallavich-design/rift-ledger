// TCGplayer prices via tcgcsv.com — free daily dumps of TCGplayer's catalogue and prices.
// Riftbound = category 89 (verified 2026-10-26). Prices are USD decimals; we store cents.
// tcgcsv refreshes once a day (~20:00 UTC), so one fetch per day is all that's useful.

import { z } from "zod";
import { fetchJson, sleep } from "./http";
import { decimalToMinor } from "@/lib/money/money";

export const TCGCSV_BASE = process.env.TCGCSV_BASE_URL ?? "https://tcgcsv.com/tcgplayer";
export const RIFTBOUND_CATEGORY_ID = 89;

const envelope = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ success: z.boolean(), errors: z.array(z.unknown()).optional(), results: z.array(item) });

const Group = z.object({
  groupId: z.number(),
  name: z.string(),
  abbreviation: z.string().nullish(),
  publishedOn: z.string().nullish(),
});

const Product = z.object({
  productId: z.number(),
  name: z.string(),
  groupId: z.number(),
  imageUrl: z.string().nullish(),
  url: z.string().nullish(),
  presaleInfo: z.object({ releasedOn: z.string().nullish() }).partial().nullish(),
  extendedData: z.array(z.object({ name: z.string(), value: z.string() })).nullish(),
});

const Price = z.object({
  productId: z.number(),
  lowPrice: z.number().nullish(),
  midPrice: z.number().nullish(),
  highPrice: z.number().nullish(),
  marketPrice: z.number().nullish(),
  subTypeName: z.string(),
});

export interface TcgGroup {
  groupId: string;
  name: string;
  abbreviation: string | null;
  publishedOn: Date | null;
}

/** A product with all of TCGplayer's card fields (Card Type, Domain, Description…). */
export interface TcgRawProduct {
  productId: string;
  name: string;
  imageUrl: string | null;
  ext: Map<string, string>;
}

export interface TcgProductRow {
  productId: string;
  groupId: string;
  groupName: string;
  name: string;
  isSingle: boolean;
  number: string | null;
  rarity: string | null;
  imageUrl: string | null;
  url: string | null;
  releasedOn: Date | null;
}

export interface TcgPriceRow {
  productId: string;
  finish: "NORMAL" | "FOIL";
  market: number | null;
  low: number | null;
  mid: number | null;
  currency: "USD";
}

export function finishFromSubType(sub: string): "NORMAL" | "FOIL" | null {
  const s = sub.toLowerCase();
  if (s === "normal") return "NORMAL";
  if (s.includes("foil")) return "FOIL";
  return null;
}

async function get<T extends z.ZodTypeAny>(path: string, item: T): Promise<z.infer<T>[]> {
  const raw = await fetchJson(`${TCGCSV_BASE}${path}`);
  const parsed = envelope(item).safeParse(raw);
  if (!parsed.success) throw new Error(`tcgcsv ${path} did not match the expected shape: ${parsed.error.message}`);
  return parsed.data.results;
}

export async function fetchGroups(): Promise<TcgGroup[]> {
  const groups = await get(`/${RIFTBOUND_CATEGORY_ID}/groups`, Group);
  return groups.map((g) => ({ groupId: String(g.groupId), name: g.name, abbreviation: g.abbreviation ?? null, publishedOn: g.publishedOn ? new Date(g.publishedOn + "Z") : null }));
}

export async function fetchRawProducts(groupId: string): Promise<TcgRawProduct[]> {
  const products = await get(`/${RIFTBOUND_CATEGORY_ID}/${groupId}/products`, Product);
  return products.map((p) => ({ productId: String(p.productId), name: p.name, imageUrl: p.imageUrl ?? null, ext: new Map((p.extendedData ?? []).map((e) => [e.name, e.value])) }));
}

export async function fetchGroup(group: TcgGroup): Promise<{ products: TcgProductRow[]; prices: TcgPriceRow[]; unknownSubTypes: string[] }> {
  const products = await get(`/${RIFTBOUND_CATEGORY_ID}/${group.groupId}/products`, Product);
  await sleep(150);
  const prices = await get(`/${RIFTBOUND_CATEGORY_ID}/${group.groupId}/prices`, Price);
  const unknown = new Set<string>();
  return {
    products: products.map((p) => {
      const ext = new Map((p.extendedData ?? []).map((e) => [e.name, e.value]));
      return {
        productId: String(p.productId),
        groupId: group.groupId,
        groupName: group.name,
        name: p.name,
        isSingle: ext.has("Number") || ext.has("Rarity"),
        number: ext.get("Number") ?? null,
        rarity: ext.get("Rarity") ?? null,
        imageUrl: p.imageUrl ?? null,
        url: p.url ?? null,
        releasedOn: p.presaleInfo?.releasedOn ? new Date(p.presaleInfo.releasedOn + "Z") : null,
      };
    }),
    prices: prices.flatMap((p) => {
      const finish = finishFromSubType(p.subTypeName);
      if (!finish) {
        unknown.add(p.subTypeName);
        return [];
      }
      return [
        {
          productId: String(p.productId),
          finish,
          market: decimalToMinor(p.marketPrice),
          low: decimalToMinor(p.lowPrice),
          mid: decimalToMinor(p.midPrice),
          currency: "USD" as const,
        },
      ];
    }),
    unknownSubTypes: [...unknown],
  };
}

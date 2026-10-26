// Riftcodex card-data provider — https://api.riftcodex.com (free, no key).
// Shapes verified against the live API on 2026-10-26 (see /openapi.json). All responses go through Zod.

import { z } from "zod";
import { fetchJson, sleep } from "./http";
import type { CardDataProvider, ProviderPrinting, ProviderSet } from "./types";

const BASE = process.env.RIFTCODEX_BASE_URL ?? "https://api.riftcodex.com";
const PAGE_SIZE = 100; // API maximum

const nullableStr = z.string().nullish().transform((v) => v ?? null);
const nullableInt = z.number().int().nullish().transform((v) => v ?? null);

const CardSchema = z.object({
  id: z.string(),
  name: z.string(),
  riftbound_id: nullableStr,
  tcgplayer_id: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null || v === "" ? null : String(v))),
  collector_number: nullableInt,
  attributes: z
    .object({ energy: nullableInt, might: nullableInt, power: nullableInt })
    .nullish()
    .transform((v) => v ?? { energy: null, might: null, power: null }),
  classification: z.object({
    type: z.string(),
    supertype: nullableStr,
    rarity: nullableStr,
    domain: z.array(z.string()).nullish().transform((v) => v ?? []),
  }),
  text: z
    .object({ rich: nullableStr, plain: nullableStr, flavour: nullableStr })
    .nullish()
    .transform((v) => v ?? { rich: null, plain: null, flavour: null }),
  set: z.object({ set_id: z.string(), label: z.string().nullish() }),
  media: z
    .object({ image_url: nullableStr, artist: nullableStr })
    .partial()
    .nullish()
    .transform((v) => v ?? {}),
  tags: z.array(z.string()).nullish().transform((v) => v ?? []),
  orientation: z.string().nullish().transform((v) => v ?? "portrait"),
  metadata: z
    .object({
      alternate_art: z.boolean().nullish(),
      overnumbered: z.boolean().nullish(),
      signature: z.boolean().nullish(),
    })
    .partial()
    .nullish()
    .transform((v) => v ?? {}),
});

const SetSchema = z.object({
  id: z.string(),
  name: z.string(),
  set_id: z.string(),
  card_count: z.number().int().nullish(),
  tcgplayer_id: z.union([z.string(), z.number()]).nullish(),
  published_on: z.string().nullish(),
});

const page = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), total: z.number(), page: z.number(), pages: z.number() });

export type RiftcodexCard = z.infer<typeof CardSchema>;

export function toPrinting(c: RiftcodexCard): ProviderPrinting {
  return {
    sourceId: c.id,
    name: c.name.trim(),
    riftboundId: c.riftbound_id,
    tcgplayerId: c.tcgplayer_id,
    collectorNumber: c.collector_number,
    energy: c.attributes.energy,
    might: c.attributes.might,
    power: c.attributes.power,
    type: c.classification.type,
    supertype: c.classification.supertype,
    rarity: c.classification.rarity,
    domains: c.classification.domain,
    textPlain: c.text.plain ?? "",
    textRich: c.text.rich ?? "",
    flavour: c.text.flavour,
    setCode: c.set.set_id,
    imageUrl: c.media.image_url ?? null,
    artist: c.media.artist ?? null,
    tags: c.tags,
    orientation: c.orientation,
    flags: {
      alternateArt: !!c.metadata.alternate_art,
      overnumbered: !!c.metadata.overnumbered,
      signature: !!c.metadata.signature,
    },
  };
}

async function getAllPages<T extends z.ZodTypeAny>(path: string, item: T): Promise<z.infer<T>[]> {
  const out: z.infer<T>[] = [];
  const schema = page(item);
  for (let p = 1; ; p++) {
    const sep = path.includes("?") ? "&" : "?";
    const raw = await fetchJson(`${BASE}${path}${sep}size=${PAGE_SIZE}&page=${p}`);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Riftcodex response for ${path} (page ${p}) did not match the expected shape: ${parsed.error.message}`);
    }
    out.push(...parsed.data.items);
    if (p >= parsed.data.pages) break;
    await sleep(150); // be polite
  }
  return out;
}

export const riftcodex: CardDataProvider = {
  id: "riftcodex",

  async getSets(): Promise<ProviderSet[]> {
    const sets = await getAllPages("/sets", SetSchema);
    return sets.map((s) => ({
      sourceId: s.id,
      code: s.set_id,
      name: s.name,
      cardCount: s.card_count ?? 0,
      releaseDate: s.published_on ? new Date(s.published_on + (s.published_on.endsWith("Z") ? "" : "Z")) : null,
      tcgplayerId: s.tcgplayer_id == null ? null : String(s.tcgplayer_id),
    }));
  },

  async getCards(setCode?: string) {
    const q = setCode ? `/cards?set_id=${encodeURIComponent(setCode)}` : "/cards";
    return (await getAllPages(q, CardSchema)).map(toPrinting);
  },

  async searchCards(query: string) {
    const raw = await fetchJson(`${BASE}/cards/name?fuzzy=${encodeURIComponent(query)}&size=20`);
    return page(CardSchema).parse(raw).items.map(toPrinting);
  },

  async getCard(id: string) {
    try {
      return toPrinting(CardSchema.parse(await fetchJson(`${BASE}/cards/${encodeURIComponent(id)}`)));
    } catch {
      return null;
    }
  },
};

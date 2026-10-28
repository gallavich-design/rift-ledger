// Deck image options shared by the export panel (browser) and the image route (server).

export type ImageGrouping = "section" | "type";

export const BACKGROUND_PRESETS = [
  { label: "Paper", value: "#fbfaf7" },
  { label: "White", value: "#ffffff" },
  { label: "Sand", value: "#efe6d2" },
  { label: "Slate", value: "#2b3038" },
  { label: "Navy", value: "#0f1a2e" },
  { label: "Black", value: "#0d0e10" },
] as const;
export const DEFAULT_BACKGROUND = "#fbfaf7";

export function parseBackground(v: string | null | undefined): string {
  return v && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : DEFAULT_BACKGROUND;
}

export function parseGrouping(v: string | null | undefined): ImageGrouping {
  return v === "type" ? "type" : "section";
}

/** Query string for /decks/<id>/image. */
export function imageQuery(o: { grouping: ImageGrouping; background: string }): string {
  const p = new URLSearchParams();
  if (o.grouping !== "section") p.set("group", o.grouping);
  if (parseBackground(o.background) !== DEFAULT_BACKGROUND) p.set("bg", parseBackground(o.background));
  const s = p.toString();
  return s ? `?${s}` : "";
}

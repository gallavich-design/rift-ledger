// Short printing label, e.g. "OGN·042 · Alternate art · Foil". Plain function — safe on server and client.
import type { PickedVariant } from "@/components/cards/VariantPicker";

export function variantLabel(v: Pick<PickedVariant, "art" | "finish" | "setCode" | "collectorNumber" | "graded" | "language">) {
  return [
    `${v.setCode}·${String(v.collectorNumber ?? "").padStart(3, "0")}`,
    v.art,
    v.finish === "FOIL" ? "Foil" : "Normal",
    v.language !== "EN" ? v.language : null,
    v.graded,
  ]
    .filter(Boolean)
    .join(" · ");
}

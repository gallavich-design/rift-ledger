"use client";

import { useEffect, useState } from "react";
import { ImageDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/fields";
import { BACKGROUND_PRESETS, DEFAULT_BACKGROUND, imageQuery, parseBackground, type ImageGrouping } from "@/lib/decks/imageOptions";
import { cn } from "@/lib/ui";

const STORE = "rl-deck-image";

/** Deck → A4 image: pick the layout and background, preview, download. Remembers your last choice. */
export function ImageExport({ deckId, deckName }: { deckId: string; deckName: string }) {
  const [open, setOpen] = useState(false);
  const [grouping, setGrouping] = useState<ImageGrouping>("section");
  const [background, setBackground] = useState(DEFAULT_BACKGROUND);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "{}");
      if (saved.grouping === "type") setGrouping("type");
      if (saved.background) setBackground(parseBackground(saved.background));
    } catch {
      /* storage unavailable — defaults are fine */
    }
  }, []);

  const query = imageQuery({ grouping, background });
  // Debounce the preview so dragging the colour picker doesn't fire a render per pixel.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setLoaded(false);
      setPreviewSrc(`/decks/${deckId}/image${query}`);
    }, 350);
    try {
      localStorage.setItem(STORE, JSON.stringify({ grouping, background }));
    } catch {
      /* ignore */
    }
    return () => clearTimeout(t);
  }, [open, deckId, query, grouping, background]);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/decks/${deckId}/image${query}`);
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${deckName.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "deck"}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Couldn't make the image — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} data-testid="export-image">
        <ImageDown size={14} aria-hidden /> Image
      </Button>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-[var(--radius-panel)] border border-rule bg-sheet p-3" data-testid="image-panel">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Deck image · A4</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-3 hover:text-ink">
          Close
        </button>
      </div>
      <Segmented
        label="Layout"
        name={`img-group-${deckId}`}
        value={grouping}
        onChange={setGrouping}
        options={[
          { value: "section", label: "Deck order" },
          { value: "type", label: "By card type" },
        ]}
      />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Background</legend>
        <div className="flex flex-wrap items-center gap-2">
          {BACKGROUND_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              title={p.label}
              aria-label={p.label}
              aria-pressed={background === p.value}
              onClick={() => setBackground(p.value)}
              className={cn("size-8 rounded-full border border-rule-strong", background === p.value && "ring-2 ring-quill ring-offset-2 ring-offset-sheet")}
              style={{ background: p.value }}
            />
          ))}
          <label className={cn("relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-rule-strong px-2.5 text-xs", !BACKGROUND_PRESETS.some((p) => p.value === background) && "ring-2 ring-quill ring-offset-2 ring-offset-sheet")}>
            <span className="size-4 rounded-full border border-rule-strong" style={{ background }} aria-hidden />
            Custom
            <input type="color" value={background} onChange={(e) => setBackground(parseBackground(e.target.value))} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom background colour" data-testid="image-bg" />
          </label>
        </div>
      </fieldset>
      <div className="relative aspect-[1240/1754] w-full overflow-hidden rounded-[var(--radius-control)] border border-rule bg-inset">
        {previewSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewSrc} alt={`Preview of ${deckName}`} className={cn("absolute inset-0 h-full w-full object-contain transition-opacity", loaded ? "opacity-100" : "opacity-40")} onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} />
        )}
        {!loaded && <span className="absolute inset-0 grid place-items-center text-xs text-ink-3">Making preview…</span>}
      </div>
      {error && (
        <p role="alert" className="text-xs text-loss">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={download} disabled={busy} data-testid="image-download">
          <ImageDown size={14} aria-hidden /> {busy ? "Making image…" : "Download PNG"}
        </Button>
        <a href={`/decks/${deckId}/image${query}`} target="_blank" rel="noreferrer" className="text-[13px] text-quill hover:underline">
          Open full size
        </a>
        <span className="text-xs text-ink-3">1240 × 1754 px (A4, 150 dpi)</span>
      </div>
    </div>
  );
}

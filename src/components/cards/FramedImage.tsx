"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/ui";

// A card picture inside a frame shaped like the card (portrait, or landscape for battlefields).
// Sources disagree on how they store sideways cards: Riftcodex gives battlefields as landscape
// images, TCGplayer (our fallback for newer sets, e.g. Radiance) gives them turned upright. When
// the image's shape doesn't match the frame, it's turned 90° to fit, so a battlefield reads correctly
// whichever source it came from. TCGplayer's upright battlefields are the landscape card turned
// anticlockwise (name along the right edge); the deck image export uses that same upright form.

// Card proportions: 744 × 1039 (portrait). Rotated, the image's width spans the frame's height.
const SHORT = `${(744 / 1039) * 100}%`;
const LONG = `${(1039 / 744) * 100}%`;

export function FramedImage({
  src,
  alt,
  landscape,
  className,
  loading = "lazy",
  fallbackSrc,
  missingLabel = "No image",
}: {
  src: string;
  alt: string;
  /** The frame is landscape (battlefield). */
  landscape?: boolean;
  /** Extra classes for the <img> (e.g. object-contain, opacity). */
  className?: string;
  loading?: "lazy" | "eager";
  /** Shown instead when `src` doesn't load (some TCGplayer products have no picture). */
  fallbackSrc?: string | null;
  /** Text in the frame when there's no picture at all. */
  missingLabel?: string;
}) {
  const [turn, setTurn] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const current = [src, fallbackSrc].find((u): u is string => !!u && !failed.includes(u)) ?? null;
  const fail = useCallback((u: string) => setFailed((f) => (f.includes(u) ? f : [...f, u])), []);
  const check = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img || !img.complete) return;
      if (!img.naturalWidth) {
        // Finished loading with nothing to show: broken (also catches errors before hydration).
        if (img.currentSrc || img.src) fail(img.getAttribute("src") ?? "");
        return;
      }
      const wide = img.naturalWidth > img.naturalHeight;
      setTurn(!!landscape !== wide && img.naturalWidth !== img.naturalHeight);
    },
    [landscape, fail],
  );

  if (!current)
    return (
      <span className="absolute inset-0 grid place-items-center p-1.5 text-center text-[11px] leading-tight text-ink-3" data-testid="no-image">
        {missingLabel}
      </span>
    );

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={current}
      ref={check} // catches images already loaded (or failed) from cache before hydration
      src={current}
      alt={alt}
      loading={loading}
      decoding="async"
      onLoad={(e) => check(e.currentTarget)}
      onError={() => fail(current)}
      data-turned={turn || undefined}
      className={cn("absolute object-cover", !turn && "inset-0 h-full w-full", className)}
      style={
        turn
          ? {
              left: "50%",
              top: "50%",
              width: landscape ? SHORT : LONG,
              height: landscape ? LONG : SHORT,
              // Upright source in a landscape frame: turn it back clockwise. Landscape source in a
              // portrait frame: turn it anticlockwise, like TCGplayer's (and the export's) upright form.
              transform: `translate(-50%, -50%) rotate(${landscape ? 90 : -90}deg)`,
            }
          : undefined
      }
    />
  );
}

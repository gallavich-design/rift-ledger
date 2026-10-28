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
}: {
  src: string;
  alt: string;
  /** The frame is landscape (battlefield). */
  landscape?: boolean;
  /** Extra classes for the <img> (e.g. object-contain, opacity). */
  className?: string;
  loading?: "lazy" | "eager";
}) {
  const [turn, setTurn] = useState(false);
  const check = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img || !img.complete || !img.naturalWidth) return;
      const wide = img.naturalWidth > img.naturalHeight;
      setTurn(!!landscape !== wide && img.naturalWidth !== img.naturalHeight);
    },
    [landscape],
  );

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={check} // catches images already loaded from cache before hydration
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      onLoad={(e) => check(e.currentTarget)}
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

import { domainColor } from "@/config/domains";
import { cn } from "@/lib/ui";

/** Signature element: a printing's ticker, e.g. OGN·174. */
export function Ticker({ setCode, number, className }: { setCode: string; number: number | null; className?: string }) {
  return (
    <span
      className={cn(
        "num inline-flex h-5 items-center rounded-[3px] border border-rule px-1.5 text-[11px] font-medium text-ink-2",
        className,
      )}
    >
      {setCode}
      {number != null && (
        <>
          <span className="px-[1px] text-ink-4">·</span>
          {String(number).padStart(3, "0")}
        </>
      )}
    </span>
  );
}

export function DomainChip({ name }: { name: string }) {
  const c = domainColor(name);
  return (
    <span
      className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium"
      style={{ background: c.bg, color: c.fg }}
    >
      <span className="size-1.5 rounded-full" style={{ background: c.solid }} aria-hidden />
      {name}
    </span>
  );
}

export function CardArt({
  src,
  alt,
  landscape,
  className,
  priority,
}: {
  src: string | null;
  alt: string;
  landscape?: boolean;
  className?: string;
  priority?: boolean;
}) {
  return (
    <span
      className={cn(
        "relative block overflow-hidden rounded-[var(--radius-art)] bg-inset ring-1 ring-rule",
        landscape ? "aspect-[1039/744]" : "aspect-[744/1039]",
        className,
      )}
    >
      {src ? (
        // Upstream images are already sized for the web; next/image optimisation is off (next.config.ts).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-xs text-ink-3">No image</span>
      )}
    </span>
  );
}

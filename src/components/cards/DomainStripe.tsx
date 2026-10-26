import { domainColor } from "@/config/domains";
import { pipeSplit } from "@/lib/catalog/grouping";
import { cn } from "@/lib/ui";

/** Signature element: a thin stripe in the card's domain colour(s), split evenly for multi-domain cards. */
export function DomainStripe({ domains, className }: { domains: string | string[]; className?: string }) {
  const list = Array.isArray(domains) ? domains : pipeSplit(domains);
  const items = list.length ? list : ["Colorless"];
  return (
    <span className={cn("flex", className)} aria-hidden>
      {items.map((d) => (
        <span key={d} className="h-full flex-1" style={{ background: domainColor(d).solid }} />
      ))}
    </span>
  );
}

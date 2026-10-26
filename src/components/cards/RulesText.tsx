import { Fragment } from "react";
import { parseRules, type Segment } from "@/lib/catalog/rulesText";
import { domainColor } from "@/config/domains";

const RUNE_DOMAIN: Record<string, string> = {
  fury: "Fury",
  calm: "Calm",
  mind: "Mind",
  body: "Body",
  chaos: "Chaos",
  order: "Order",
};

function Icon({ seg }: { seg: Extract<Segment, { kind: "icon" }> }) {
  const base = "num mx-[1px] inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 align-[-3px] text-[11px] font-medium";
  if (seg.icon === "energy")
    return (
      <span className={`${base} bg-ink text-sheet`} title={`${seg.value} energy`} aria-label={`${seg.value} energy`} role="img">
        {seg.value}
      </span>
    );
  if (seg.icon === "might")
    return (
      <span className={`${base} border border-rule-strong text-ink-2`} title="Might" aria-label="Might" role="img">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" />
        </svg>
      </span>
    );
  if (seg.icon === "exhaust")
    return (
      <span className={`${base} border border-rule-strong text-ink-2`} title="Exhaust" aria-label="Exhaust" role="img">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
        </svg>
      </span>
    );
  const domain = RUNE_DOMAIN[seg.value];
  const label = domain ? `${domain} rune` : "Rune of any domain";
  const c = domain ? domainColor(domain) : null;
  return (
    <span
      className={`${base} text-white`}
      style={{
        background: c ? c.solid : "conic-gradient(#C8372D,#D9781F,#C9A019,#2E8B57,#2F6BD1,#7B48C4,#C8372D)",
      }}
      title={label}
      aria-label={label}
      role="img"
    >
      ◆
    </span>
  );
}

export function RulesText({ rich, plain }: { rich: string; plain: string }) {
  const blocks = parseRules(rich, plain);
  if (!blocks.length) return <p className="text-sm text-ink-3">No rules text.</p>;
  return (
    <div className="rules space-y-2 text-[15px] leading-relaxed text-ink">
      {blocks.map((b, i) => {
        const content = b.segments.map((s, j) => (
          <Fragment key={j}>
            {s.kind === "text" && s.text}
            {s.kind === "keyword" && (
              <span className="rounded-[3px] bg-inset px-1 py-[1px] text-[13px] font-medium text-ink">{s.text}</span>
            )}
            {s.kind === "icon" && <Icon seg={s} />}
          </Fragment>
        ));
        return b.kind === "bullet" ? (
          <p key={i} className="flex gap-2 pl-1">
            <span className="text-ink-3" aria-hidden>
              •
            </span>
            <span>{content}</span>
          </p>
        ) : (
          <p key={i}>{content}</p>
        );
      })}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Minus, Plus, X } from "lucide-react";
import type { EditorCard } from "@/lib/decks/data";
import type { DeckLine, Section } from "@/lib/decks/types";
import type { VariantPrice } from "@/lib/decks/cost";
import { ART_LABEL, type VariantArt } from "@/lib/domain/enums";
import { GAME_RULES } from "@/config/gameRules";
import { domainColor } from "@/config/domains";
import { RulesText } from "@/components/cards/RulesText";
import { FramedImage } from "@/components/cards/FramedImage";
import { cn } from "@/lib/ui";

// The deck as pictures (Piltover Archive-style): Legend and runes on top, battlefields, then the main
// deck with the Chosen Champion first, then the sideboard. Click any card for its details.

export interface GalleryEdit {
  inc: (l: DeckLine) => void;
  dec: (l: DeckLine) => void;
  /** Pick the printing (art/finish) for this line; null = the default printing. */
  printing?: (l: DeckLine, variantId: string | null) => void;
}

/** Printings of each card (from the deck pricing), optionally with the one used when none is chosen. */
export type GalleryPrintings = Map<string, { defaultVariantId?: string | null; variants: VariantPrice[] }>;

const artName = (a?: string) => (a ? (ART_LABEL[a as VariantArt] ?? a) : "Standard");

/** The printing a line shows: the chosen one, else the card's default. */
export function chosenPrinting(l: DeckLine, printings?: GalleryPrintings): VariantPrice | null {
  const p = printings?.get(l.cardId);
  if (!p) return null;
  return p.variants.find((v) => v.variantId === l.preferredVariantId) ?? p.variants.find((v) => v.variantId === p.defaultVariantId) ?? null;
}

const byCost = (cards: Map<string, EditorCard>) => (a: DeckLine, b: DeckLine) =>
  (cards.get(a.cardId)?.energy ?? 99) - (cards.get(b.cardId)?.energy ?? 99) || (cards.get(a.cardId)?.name ?? "").localeCompare(cards.get(b.cardId)?.name ?? "");

export function DeckGallery({ lines, cards, owned, edit, issues, printings, formatPrice, cardLinks = true }: { lines: DeckLine[]; cards: Map<string, EditorCard>; owned?: Map<string, number>; edit?: GalleryEdit; issues?: Map<string, string>; printings?: GalleryPrintings; formatPrice?: (n: number) => string; cardLinks?: boolean }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const live = lines.filter((l) => l.quantity > 0 && cards.has(l.cardId));
  const of = (s: Section) => live.filter((l) => l.section === s).sort(byCost(cards));
  const count = (ls: DeckLine[]) => ls.reduce((a, l) => a + l.quantity, 0);
  const legend = of("LEGEND");
  const runes = of("RUNES");
  const bfs = of("BATTLEFIELDS");
  const champion = of("CHAMPION");
  const main = of("MAIN");
  const side = of("SIDEBOARD");
  const key = (l: DeckLine) => `${l.section}|${l.cardId}`;
  const openLine = live.find((l) => key(l) === openKey) ?? null;

  const tile = (l: DeckLine, variant: "card" | "wide" = "card") => {
    const c = cards.get(l.cardId)!;
    const champion = l.section === "CHAMPION";
    const problem = issues?.get(l.cardId);
    const short = owned ? Math.max(0, l.quantity - (owned.get(l.cardId) ?? 0)) : 0;
    const pr = chosenPrinting(l, printings);
    const img = pr?.imageUrl ?? c.imageUrl;
    const special = pr?.art && pr.art !== "STANDARD";
    // Badge only a printing you picked (not the default), so it marks your choices.
    const picked = !!pr && !!l.preferredVariantId && l.preferredVariantId !== printings?.get(l.cardId)?.defaultVariantId;
    return (
      <li key={key(l)} className="min-w-0">
        <button
          type="button"
          onClick={() => setOpenKey(key(l))}
          className={cn(
            "group relative block w-full overflow-hidden rounded-[10px] bg-inset text-left ring-1 ring-rule transition hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-10px_rgba(22,24,29,0.45)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-quill",
            problem && "ring-2 ring-loss",
            variant === "wide" ? "aspect-[1039/744]" : "aspect-[744/1039]",
          )}
          aria-label={`${c.name}, ${l.quantity} ${l.quantity === 1 ? "copy" : "copies"}${champion ? ", Chosen Champion" : ""}${special ? `, ${artName(pr?.art)}` : ""} — show details`}
          data-testid="gallery-card"
        >
          {img ? (
            <FramedImage src={img} alt="" landscape={variant === "wide"} fallbackSrc={c.imageUrl} missingLabel={c.name} />
          ) : (
            <span className="absolute inset-0 grid place-items-center p-2 text-center text-xs text-ink-2">{c.name}</span>
          )}
          {picked && (
            <span className="absolute top-1.5 right-1.5 rounded-[4px] bg-ink/85 px-1.5 py-0.5 text-[10px] font-semibold text-white" data-testid="printing-badge">
              {[artName(pr?.art), pr?.finish === "FOIL" ? "Foil" : null].filter(Boolean).join(" · ")}
            </span>
          )}
          <span className="num absolute right-1.5 bottom-1.5 rounded-[5px] border border-rule bg-sheet/95 px-1.5 py-0.5 text-[13px] font-semibold text-ink">×{l.quantity}</span>
          {short > 0 && (
            <span className="num absolute bottom-1.5 left-1.5 rounded-[5px] bg-caution-tint px-1.5 py-0.5 text-[11px] font-medium text-caution" title={`You're missing ${short}`}>
              need {short}
            </span>
          )}
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-7" data-testid="deck-gallery">
      {/* Top row: Legend, then the Chosen Champion beside it, then the runes. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] sm:gap-x-6">
        <Block title="Legend" n={count(legend)} target={GAME_RULES.legend.count}>
          <ul className="grid max-w-[220px] grid-cols-1">{legend.map((l) => tile(l))}</ul>
        </Block>
        <Block title="Champion" n={count(champion)} target={GAME_RULES.chosenChampion.count} label="Chosen Champion">
          <ul className="grid max-w-[220px] grid-cols-1">{champion.map((l) => tile(l))}</ul>
        </Block>
        <div className="col-span-2 sm:col-span-1">
          <Block title="Runes" n={count(runes)} target={GAME_RULES.runeDeck.size}>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-3 xl:grid-cols-4">{runes.map((l) => tile(l))}</ul>
          </Block>
        </div>
      </div>
      <Block title="Battlefields" n={count(bfs)} target={GAME_RULES.battlefields.count}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{bfs.map((l) => tile(l, cards.get(l.cardId)?.orientation === "landscape" ? "wide" : "card"))}</ul>
      </Block>
      <Block title="Main deck" n={count(main) + count(champion)} target={GAME_RULES.mainDeck.minSize} note={champion.length ? "incl. Chosen Champion" : undefined}>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 xl:grid-cols-6">{main.map((l) => tile(l))}</ul>
      </Block>
      {side.length > 0 && (
        <Block title="Sideboard" n={count(side)} target={GAME_RULES.sideboard.max} max>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 xl:grid-cols-6">{side.map((l) => tile(l))}</ul>
        </Block>
      )}
      {openLine && <CardDialog line={openLine} card={cards.get(openLine.cardId)!} owned={owned?.get(openLine.cardId)} edit={edit} issue={issues?.get(openLine.cardId)} cardLinks={cardLinks} printings={printings} formatPrice={formatPrice} onClose={() => setOpenKey(null)} />}
    </div>
  );
}

function Block({ title, n, target, max, label, note, children }: { title: string; n: number; target: number; max?: boolean; label?: string; note?: string; children: React.ReactNode }) {
  const ok = max ? n <= target : n === target || (title === "Main deck" && n >= target);
  return (
    <section aria-label={label ?? title}>
      <h2 className="mb-2.5 flex items-baseline gap-2 text-[13px] font-semibold tracking-wide uppercase">
        {title}
        <span className={cn("num", n === 0 ? "text-ink-3" : ok ? "text-gain" : "text-loss")}>
          {n}/{target}
        </span>
        {note && <span className="text-[11px] font-normal tracking-normal text-ink-3 normal-case">{note}</span>}
      </h2>
      {n === 0 ? <p className="rounded-[var(--radius-panel)] border border-dashed border-rule-strong px-4 py-6 text-center text-sm text-ink-3">Nothing here yet.</p> : children}
    </section>
  );
}

const SECTION_NAME: Record<Section, string> = { LEGEND: "Legend", CHAMPION: "Chosen Champion", MAIN: "Main deck", RUNES: "Runes", BATTLEFIELDS: "Battlefields", SIDEBOARD: "Sideboard" };

function CardDialog({ line, card: c, owned, edit, issue, cardLinks, printings, formatPrice, onClose }: { line: DeckLine; card: EditorCard; owned?: number; edit?: GalleryEdit; issue?: string; cardLinks: boolean; printings?: GalleryPrintings; formatPrice?: (n: number) => string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  const playable = ["Unit", "Spell", "Gear"].includes(c.type);
  const stats = [
    { label: "Energy", value: c.energy, show: playable || c.energy != null },
    { label: "Power", value: c.power ?? 0, show: playable },
    { label: "Might", value: c.might, show: c.type === "Unit" || c.might != null },
  ].filter((s) => s.show);
  const pr = chosenPrinting(line, printings);
  const img = pr?.imageUrl ?? c.imageUrl;
  const number = pr?.number ?? `${c.setCode}-${String(c.collectorNumber ?? "").padStart(3, "0")}`;
  const all = printings?.get(c.cardId)?.variants ?? [];
  const defaultId = printings?.get(c.cardId)?.defaultVariantId ?? null;
  const canPick = !!edit?.printing && all.length > 1;
  // One thumbnail per distinct picture; picking one keeps the current finish where that art has it.
  const arts = [...new Map(all.map((v) => [v.imageUrl ?? v.variantId, v])).values()];
  const pick = (id: string | null) => edit?.printing?.(line, id === defaultId ? null : id);
  const pickArt = (v: VariantPrice) => {
    const same = all.filter((x) => (x.imageUrl ?? x.variantId) === (v.imageUrl ?? v.variantId));
    pick((same.find((x) => x.finish === (pr?.finish ?? "NORMAL")) ?? same.find((x) => x.finish === "NORMAL") ?? same[0]).variantId);
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
      aria-labelledby="card-dialog-title"
      className="m-auto w-[min(860px,calc(100vw-24px))] max-w-none rounded-[var(--radius-panel)] border border-rule bg-sheet p-0 text-ink shadow-[0_24px_60px_-20px_rgba(22,24,29,0.45)] backdrop:bg-ink/40"
      data-testid="card-dialog"
    >
      <div className="relative grid gap-5 p-4 sm:grid-cols-[minmax(0,300px)_minmax(0,1fr)] sm:p-5">
        <button type="button" onClick={onClose} className="absolute top-3 right-3 grid size-8 place-items-center rounded-[var(--radius-control)] border border-rule bg-sheet text-ink-2 hover:bg-hover" aria-label="Close">
          <X size={16} />
        </button>
        <div className={cn("relative mx-auto mt-9 w-full max-w-[300px] overflow-hidden sm:mt-0 rounded-[12px] bg-inset ring-1 ring-rule", c.orientation === "landscape" ? "aspect-[1039/744]" : "aspect-[744/1039]")}>
          {img && <FramedImage src={img} alt={`${c.name}${pr?.art && pr.art !== "STANDARD" ? ` (${artName(pr.art)})` : ""}`} landscape={c.orientation === "landscape"} loading="eager" fallbackSrc={c.imageUrl} missingLabel={c.name} />}
        </div>
        <div className="min-w-0 space-y-4">
          <div className="pr-10">
            <h2 id="card-dialog-title" className="text-xl font-semibold tracking-[-0.01em]">
              {c.name}
            </h2>
            <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <Chip>{[c.supertype, c.type].filter(Boolean).join(" ")}</Chip>
              {c.rarity && <Chip>{c.rarity}</Chip>}
              {(c.domains.length ? c.domains : ["Colorless"]).map((d) => (
                <Chip key={d} dot={domainColor(d).solid}>
                  {d}
                </Chip>
              ))}
            </ul>
          </div>
          {stats.length > 0 && (
            <dl className="grid overflow-hidden rounded-[var(--radius-control)] border border-rule" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
              {stats.map((s) => (
                <div key={s.label} className="border-r border-rule px-3 py-2 text-center last:border-r-0">
                  <dt className="text-[11px] text-ink-3">{s.label}</dt>
                  <dd className="num text-[22px] leading-tight font-semibold">{s.value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          )}
          <section>
            <h3 className="mb-1.5 text-sm font-semibold">Description</h3>
            <RulesText rich={c.rulesTextRich} plain={c.rulesText} />
            {c.flavourText && <p className="mt-2 text-sm text-ink-3 italic">{c.flavourText}</p>}
          </section>
          <section className="rounded-[var(--radius-control)] border border-rule bg-inset px-3 py-2.5 text-sm">
            <h3 className="mb-1 text-sm font-semibold">Card information</h3>
            <p className="text-ink-2">
              Set: <span className="text-ink">{c.setName}</span>
            </p>
            <p className="text-ink-2">
              Card number: <span className="num text-ink">{number}</span>
            </p>
            {pr && (
              <p className="text-ink-2">
                Printing:{" "}
                <span className="text-ink">
                  {artName(pr.art)}
                  {pr.finish === "FOIL" ? " · Foil" : ""}
                </span>
              </p>
            )}
          </section>
          {canPick && (
            <section data-testid="printing-picker">
              <h3 className="mb-2 text-sm font-semibold">Printing</h3>
              {arts.length > 1 && (
                <ul className="mb-2.5 flex flex-wrap gap-2" aria-label="Art">
                  {arts.map((v) => {
                    const on = (pr?.imageUrl ?? pr?.variantId) === (v.imageUrl ?? v.variantId);
                    return (
                      <li key={v.variantId}>
                        <button
                          type="button"
                          onClick={() => pickArt(v)}
                          aria-pressed={on}
                          aria-label={`${artName(v.art)} ${v.number ?? ""}`.trim()}
                          title={`${artName(v.art)} · ${v.number ?? ""}`}
                          className={cn("relative block w-[54px] overflow-hidden rounded-[6px] bg-inset ring-1 ring-rule", c.orientation === "landscape" ? "aspect-[1039/744] w-[76px]" : "aspect-[744/1039]", on && "ring-2 ring-quill")}
                        >
                          {v.imageUrl && <FramedImage src={v.imageUrl} alt="" landscape={c.orientation === "landscape"} missingLabel={`${v.number ?? ""} no picture`} />}
                          {on && <span className="absolute inset-x-0 bottom-0 bg-quill py-px text-center text-[9px] font-semibold text-white">In deck</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <label className="block">
                <span className="sr-only">Printing for {c.name}</span>
                <select
                  value={pr?.variantId ?? ""}
                  onChange={(e) => pick(e.target.value || null)}
                  className="h-9 w-full rounded-[var(--radius-control)] border border-rule bg-sheet px-2 text-sm focus:border-quill focus:outline-none"
                  data-testid="printing-select"
                >
                  {all.map((v) => (
                    <option key={v.variantId} value={v.variantId}>
                      {v.label}
                      {v.variantId === defaultId ? " (default)" : ""}
                      {formatPrice ? ` — ${v.unit != null ? formatPrice(v.unit) : "no price"}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-1.5 text-xs text-ink-3">The deck shows this art, prices this printing and uses it in the image export.</p>
            </section>
          )}
          {issue && <p className="rounded-[var(--radius-control)] bg-loss-tint px-3 py-2 text-sm text-loss">{issue}</p>}
          <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-3">
            <span className="text-sm text-ink-2">
              {SECTION_NAME[line.section]}
              {owned != null && (
                <span className={cn("ml-2 text-xs", owned >= line.quantity ? "text-gain" : "text-caution")}>
                  · you own {owned}
                </span>
              )}
            </span>
            {edit ? (
              <span className="inline-flex items-center rounded-[var(--radius-control)] border border-rule" role="group" aria-label={`Copies of ${c.name}`}>
                <button type="button" className="grid size-9 place-items-center text-ink-2 hover:bg-hover" onClick={() => edit.dec(line)} aria-label={`One fewer ${c.name}`}>
                  <Minus size={14} />
                </button>
                <span className="num w-8 text-center text-sm font-semibold" aria-live="polite">
                  {line.quantity}
                </span>
                <button type="button" className="grid size-9 place-items-center text-ink-2 hover:bg-hover" onClick={() => edit.inc(line)} aria-label={`One more ${c.name}`}>
                  <Plus size={14} />
                </button>
              </span>
            ) : (
              <span className="num text-sm font-semibold">×{line.quantity}</span>
            )}
            {cardLinks && (
              <Link href={`/cards/${c.cardId}`} className="ml-auto inline-flex items-center gap-1 text-sm text-quill hover:underline">
                Card page <ExternalLink size={13} aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}

function Chip({ children, dot }: { children: React.ReactNode; dot?: string }) {
  return (
    <li className="inline-flex h-7 items-center gap-1.5 rounded-full border border-rule bg-inset px-2.5 text-ink">
      {dot && <span className="size-2.5 rounded-full" style={{ background: dot }} aria-hidden />}
      {children}
    </li>
  );
}

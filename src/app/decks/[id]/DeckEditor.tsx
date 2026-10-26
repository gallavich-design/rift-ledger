"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Minus, Plus, Search, X } from "lucide-react";
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { validateDeck, type Issue } from "@/lib/decks/validate";
import { costDeck, type CardPricing } from "@/lib/decks/cost";
import { deckStats } from "@/lib/decks/stats";
import { diffSnapshots, formatDiff } from "@/lib/decks/diff";
import { defaultSection, SECTION_LABEL, SECTIONS, type DeckLine, type Section } from "@/lib/decks/types";
import type { EditorCard } from "@/lib/decks/data";
import { GAME_RULES } from "@/config/gameRules";
import { AXIS_TEXT, BAR_COLOR } from "@/config/chartColors";
import { formatMoney } from "@/lib/money/money";
import { Button } from "@/components/ui/Button";
import { DomainStripe } from "@/components/cards/DomainStripe";
import { cn } from "@/lib/ui";
import { saveDeck } from "../actions";

interface Props {
  deckId: string;
  initialName: string;
  initialLines: DeckLine[];
  cards: EditorCard[];
  pricing: CardPricing[];
  owned: [string, number][];
  bannedNames: string[];
  today: string;
  currency: string;
  sourceLabel: string;
  notices: { errata: { date: string; count: number }[]; rotation: { date: string; label: string; cards: number } | null };
}

const TARGET: Partial<Record<Section, string>> = {
  LEGEND: `${GAME_RULES.legend.count}`,
  CHAMPION: `${GAME_RULES.chosenChampion.count}`,
  RUNES: `${GAME_RULES.runeDeck.size}`,
  BATTLEFIELDS: `${GAME_RULES.battlefields.count}`,
  SIDEBOARD: GAME_RULES.sideboard.allowedSizes.join(" or "),
};

const key = (l: Pick<DeckLine, "section" | "cardId">) => `${l.section}|${l.cardId}`;

export function DeckEditor(p: Props) {
  const router = useRouter();
  const [name, setName] = useState(p.initialName);
  const [lines, setLines] = useState<DeckLine[]>(p.initialLines);
  const [baseline, setBaseline] = useState({ name: p.initialName, lines: p.initialLines });
  const [cards, setCards] = useState(() => new Map(p.cards.map((c) => [c.cardId, c])));
  const [pricing, setPricing] = useState(() => new Map(p.pricing.map((c) => [c.cardId, c])));
  const [owned, setOwned] = useState(() => new Map(p.owned));
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  // Server data changed (e.g. an import line was resolved) and nothing local is unsaved → adopt it.
  const serverKey = JSON.stringify(p.initialLines) + p.initialName;
  const lastServerKey = useRef(serverKey);
  useEffect(() => {
    if (lastServerKey.current === serverKey) return;
    lastServerKey.current = serverKey;
    setCards(new Map(p.cards.map((c) => [c.cardId, c])));
    setPricing(new Map(p.pricing.map((c) => [c.cardId, c])));
    setOwned(new Map(p.owned));
    setLines(p.initialLines);
    setName(p.initialName);
    setBaseline({ name: p.initialName, lines: p.initialLines });
  }, [serverKey, p]);

  const validation = useMemo(() => validateDeck(lines, cards, { today: p.today, bannedNames: p.bannedNames }), [lines, cards, p.today, p.bannedNames]);
  const cost = useMemo(() => costDeck(lines, owned, pricing), [lines, owned, pricing]);
  const stats = useMemo(() => deckStats(lines, cards), [lines, cards]);
  const names = useMemo(() => new Map([...cards.values()].map((c) => [c.cardId, c.name])), [cards]);
  const snap = (ls: DeckLine[]) => ls.filter((l) => l.quantity > 0).map((l) => ({ cardId: l.cardId, name: names.get(l.cardId) ?? "?", section: l.section, quantity: l.quantity, proxyQuantity: l.proxyQuantity, preferredVariantId: l.preferredVariantId ?? null }));
  const changes = useMemo(() => diffSnapshots(snap(baseline.lines), snap(lines)), [baseline, lines, names]); // eslint-disable-line react-hooks/exhaustive-deps
  const otherChanges = useMemo(() => {
    const sig = (ls: DeckLine[]) => JSON.stringify(ls.filter((l) => l.quantity > 0).map((l) => [key(l), l.proxyQuantity, l.preferredVariantId ?? null]).sort());
    return sig(baseline.lines) !== sig(lines);
  }, [baseline, lines]);
  const dirty = changes.length > 0 || otherChanges || name !== baseline.name;

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const issuesByCard = useMemo(() => {
    const m = new Map<string, Issue[]>();
    for (const i of validation.issues) for (const id of i.cardIds ?? []) m.set(id, [...(m.get(id) ?? []), i]);
    return m;
  }, [validation]);

  const update = useCallback((k: string, patch: Partial<DeckLine>) => setLines((ls) => ls.map((l) => (key(l) === k ? { ...l, ...patch } : l)).filter((l) => l.quantity > 0)), []);

  const addCard = useCallback(
    async (cardId: string, section?: Section) => {
      let info = cards.get(cardId);
      if (!info) {
        const r = await fetch(`/api/decks/cards?ids=${cardId}`).then((r) => r.json());
        info = r.cards[0] as EditorCard | undefined;
        if (!info) return;
        setCards((m) => new Map(m).set(cardId, info!));
        if (r.pricing[0]) setPricing((m) => new Map(m).set(cardId, r.pricing[0]));
        setOwned((m) => new Map(m).set(cardId, (r.owned as [string, number][]).find(([id]) => id === cardId)?.[1] ?? 0));
      }
      const target = section ?? defaultSection(info);
      setLines((ls) => {
        const existing = ls.find((l) => l.cardId === cardId && l.section === target);
        if (existing) return ls.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
        return [...ls, { cardId, section: target, quantity: 1, proxyQuantity: 0, preferredVariantId: null }];
      });
    },
    [cards],
  );

  const moveOne = (l: DeckLine, to: Section) =>
    setLines((ls) => {
      const next = ls.map((x) => (key(x) === key(l) ? { ...x, quantity: x.quantity - 1, proxyQuantity: Math.min(x.proxyQuantity, x.quantity - 1) } : x));
      const dest = next.find((x) => x.cardId === l.cardId && x.section === to);
      const out = dest ? next.map((x) => (x === dest ? { ...x, quantity: x.quantity + 1 } : x)) : [...next, { ...l, section: to, quantity: 1, proxyQuantity: 0 }];
      return out.filter((x) => x.quantity > 0);
    });

  function save() {
    start(async () => {
      const r = await saveDeck({ deckId: p.deckId, name, lines });
      if (r.ok) {
        setBaseline({ name, lines });
        setMsg({ ok: true, text: r.message ?? "Saved." });
        router.refresh();
      } else setMsg({ ok: false, text: r.message });
    });
  }

  const sectionLines = (s: Section) =>
    lines
      .filter((l) => l.section === s && l.quantity > 0)
      .sort((a, b) => (cards.get(a.cardId)?.energy ?? 99) - (cards.get(b.cardId)?.energy ?? 99) || (names.get(a.cardId) ?? "").localeCompare(names.get(b.cardId) ?? ""));
  const costLine = (cardId: string) => cost.lines.find((x) => x.cardId === cardId);
  const fmt = (n: number) => formatMoney(n, p.currency);

  return (
    <div>
      {/* ── Header bar ── */}
      <div className="sticky top-12 z-20 -mx-4 mb-6 border-b border-rule bg-paper/95 px-4 py-3 backdrop-blur md:top-0 md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Deck name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="w-full min-w-0 rounded-[var(--radius-control)] border border-transparent bg-transparent px-1 py-0.5 text-[22px] font-semibold tracking-[-0.015em] hover:border-rule focus:border-quill focus:bg-sheet focus:outline-none sm:text-[26px]"
            />
          </label>
          <LegalBadge legal={validation.legal} count={validation.issues.length} />
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-ink-3" data-testid="unsaved">
                {changes.length ? formatDiff(changes) : "Unsaved changes"}
              </span>
            )}
            {dirty && (
              <Button variant="ghost" size="sm" onClick={() => { setLines(baseline.lines); setName(baseline.name); setMsg(null); }}>
                Discard
              </Button>
            )}
            <Button onClick={save} disabled={!dirty || pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
        {(p.notices.errata.length > 0 || p.notices.rotation || validation.issues.some((i) => i.rule === "BANNED")) && (
          <ul className="mt-2 flex flex-wrap gap-2 text-xs" data-testid="deck-notices">
            {validation.issues
              .filter((i) => i.rule === "BANNED")
              .map((i) => (
                <li key={i.message} className="rounded-full bg-loss-tint px-2.5 py-1 font-medium text-loss">
                  ✕ {i.message.replace(" is banned.", "")} banned — deck no longer legal
                </li>
              ))}
            {p.notices.errata.map((e) => (
              <li key={e.date} className="rounded-full bg-caution-tint px-2.5 py-1 font-medium text-caution">
                ⚠ {e.count} {e.count === 1 ? "card" : "cards"} in this deck errata&apos;d on {e.date}
              </li>
            ))}
            {p.notices.rotation && (
              <li className="rounded-full bg-inset px-2.5 py-1 text-ink-2">
                ↻ {p.notices.rotation.cards} {p.notices.rotation.cards === 1 ? "card" : "cards"} {p.notices.rotation.label}
              </li>
            )}
          </ul>
        )}
        {msg && !dirty && (
          <p role="status" className={cn("mt-1 text-sm", msg.ok ? "text-gain" : "text-loss")}>
            {msg.text}
          </p>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── List ── */}
        <div className="min-w-0 space-y-6">
          <CardAdder onAdd={(id) => addCard(id)} />
          {SECTIONS.map((s) => {
            const ls = sectionLines(s);
            const count = validation.counts[s] + (s === "MAIN" ? validation.counts.CHAMPION : 0);
            const sectionIssues = validation.issues.some((i) => sectionRule(i.rule) === s);
            if (!ls.length && s === "SIDEBOARD") return null;
            return (
              <section key={s} aria-labelledby={`sec-${s}`} data-testid={`section-${s}`}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h2 id={`sec-${s}`} className="text-base font-semibold">
                    {SECTION_LABEL[s]}
                  </h2>
                  <span className={cn("num flex items-center gap-1 text-sm", sectionIssues ? "text-loss" : "text-ink-3")}>
                    {!sectionIssues && count > 0 && <Check size={13} aria-hidden className="text-gain" />}
                    {count}
                    {s === "MAIN" ? ` / ${GAME_RULES.mainDeck.minSize}+ incl. champion` : TARGET[s] ? ` / ${TARGET[s]}` : ""}
                  </span>
                </div>
                {ls.length === 0 ? (
                  <p className="rounded-[var(--radius-panel)] border border-dashed border-rule-strong px-4 py-3 text-sm text-ink-3">
                    {s === "LEGEND" ? "Search above and add a Legend — it sets your domains." : s === "CHAMPION" ? "Add a Champion unit that matches your Legend, then move one copy here." : "Nothing here yet."}
                  </p>
                ) : (
                  <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-sheet">
                    {ls.map((l) => {
                      const c = cards.get(l.cardId);
                      if (!c) return null;
                      const k = key(l);
                      const iss = issuesByCard.get(l.cardId) ?? [];
                      const cl = costLine(l.cardId);
                      const pr = pricing.get(l.cardId);
                      const isOpen = open === k;
                      return (
                        <li key={k} className={cn("border-b border-rule-soft last:border-b-0", iss.length && "shadow-[inset_3px_0_0_var(--loss)]")} data-testid="deck-row">
                          <div className="flex items-center gap-3 px-3 py-2">
                            <span className="relative h-10 w-[29px] shrink-0 overflow-hidden rounded-[3px] bg-inset">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {c.imageUrl && <img src={c.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />}
                              <DomainStripe domains={c.domains} className="absolute inset-x-0 top-0 h-[2px]" />
                            </span>
                            <span className="w-5 shrink-0 text-center">
                              {c.energy != null && (
                                <span className="num inline-flex size-5 items-center justify-center rounded-full bg-ink text-[11px] font-medium text-sheet" title={`${c.energy} energy`}>
                                  <span className="sr-only">Energy </span>
                                  {c.energy}
                                </span>
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <Link href={`/cards/${c.cardId}`} className="block truncate text-sm font-medium hover:text-quill">
                                {c.name}
                              </Link>
                              <p className="truncate text-xs text-ink-3">
                                {c.supertype ? `${c.supertype} ` : ""}
                                {c.type}
                                {cl && (
                                  <>
                                    {" · "}
                                    <span className={cl.missing ? "text-caution" : "text-gain"}>
                                      own {Math.min(owned.get(l.cardId) ?? 0, cl.quantity)}/{cl.quantity}
                                    </span>
                                  </>
                                )}
                                {l.proxyQuantity > 0 && <> · {l.proxyQuantity} proxy</>}
                              </p>
                              {iss.length > 0 && <p className="mt-0.5 text-xs text-loss">{iss[0].message}</p>}
                            </div>
                            <span className="num hidden w-20 shrink-0 text-right text-xs text-ink-3 sm:block">{cl?.normal?.unit != null ? fmt(cl.normal.unit) : "—"}</span>
                            <Stepper
                              value={l.quantity}
                              label={c.name}
                              onDec={() => update(k, { quantity: l.quantity - 1, proxyQuantity: Math.min(l.proxyQuantity, l.quantity - 1) })}
                              onInc={() => update(k, { quantity: l.quantity + 1 })}
                            />
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              aria-label={`More options for ${c.name}`}
                              onClick={() => setOpen(isOpen ? null : k)}
                              className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-control)] text-ink-3 hover:bg-hover"
                            >
                              <ChevronDown size={15} className={cn("transition-transform", isOpen && "rotate-180")} />
                            </button>
                          </div>
                          {isOpen && (
                            <div className="grid gap-3 border-t border-rule-soft bg-inset/60 px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
                              <label className="min-w-0">
                                <span className="mb-1 block text-xs font-medium text-ink-2">Printing to price</span>
                                <select
                                  value={l.preferredVariantId ?? ""}
                                  onChange={(e) => update(k, { preferredVariantId: e.target.value || null })}
                                  className="h-9 w-full rounded-[var(--radius-control)] border border-rule bg-sheet px-2 text-sm focus:border-quill focus:outline-none"
                                >
                                  <option value="">Default printing</option>
                                  {pr?.variants.map((v) => (
                                    <option key={v.variantId} value={v.variantId}>
                                      {v.label} — {v.unit != null ? fmt(v.unit) : "no price"}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <div className="flex flex-wrap items-end gap-3">
                                <div>
                                  <span className="mb-1 block text-xs font-medium text-ink-2">Proxy / borrowed</span>
                                  <Stepper
                                    value={l.proxyQuantity}
                                    label={`proxies of ${c.name}`}
                                    onDec={() => update(k, { proxyQuantity: Math.max(0, l.proxyQuantity - 1) })}
                                    onInc={() => update(k, { proxyQuantity: Math.min(l.quantity, l.proxyQuantity + 1) })}
                                  />
                                </div>
                                {(s === "MAIN" || s === "SIDEBOARD" || s === "CHAMPION") && (
                                  <div className="flex gap-1">
                                    {s !== "SIDEBOARD" && (
                                      <Button variant="secondary" size="sm" onClick={() => moveOne(l, "SIDEBOARD")}>
                                        1 to sideboard
                                      </Button>
                                    )}
                                    {s !== "MAIN" && (
                                      <Button variant="secondary" size="sm" onClick={() => moveOne(l, "MAIN")}>
                                        1 to main
                                      </Button>
                                    )}
                                    {s === "MAIN" && c.type === "Unit" && c.supertype === "Champion" && (
                                      <Button variant="secondary" size="sm" onClick={() => moveOne(l, "CHAMPION")}>
                                        Make Chosen Champion
                                      </Button>
                                    )}
                                  </div>
                                )}
                                <Button variant="ghost" size="sm" onClick={() => update(k, { quantity: 0 })}>
                                  <X size={14} aria-hidden /> Remove
                                </Button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>

        {/* ── Panels ── */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start" aria-label="Deck checks">
          <Panel title="Legality" testid="legality">
            {validation.legal ? (
              <p className="flex items-center gap-2 text-sm text-gain">
                <Check size={16} aria-hidden /> Legal in Standard
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {validation.issues.map((i, n) => (
                  <li key={n} className="flex gap-2">
                    <X size={15} className="mt-0.5 shrink-0 text-loss" aria-hidden />
                    <span>
                      <span className="sr-only">{i.rule}: </span>
                      {i.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Cost" testid="cost">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Fact label="Deck value" value={fmt(cost.value)} />
              <Fact label="You own" value={`${cost.ownedCopies} / ${cost.copies}`} hint="copies" />
              <Fact label="Cost to complete" value={fmt(cost.costToComplete)} strong testid="cost-to-complete" />
              <Fact label="Budget to complete" value={fmt(cost.budgetCostToComplete)} testid="budget-to-complete" />
              <Fact label="Budget build" value={fmt(cost.budgetValue)} hint="cheapest printings" testid="budget-value" />
              <Fact label="Missing" value={`${cost.missingCopies}`} hint="copies, incl. proxies" />
            </dl>
            <p className="mt-3 text-xs text-ink-3">
              Priced at {p.sourceLabel}
              {cost.unpriced.length > 0 && <> · {cost.unpriced.length} card{cost.unpriced.length === 1 ? "" : "s"} without a price</>}
            </p>
            {cost.swaps.length > 0 && (
              <details className="mt-3 border-t border-rule pt-3" data-testid="swaps">
                <summary className="cursor-pointer text-sm font-medium">
                  Budget swaps · save <span className="num">{fmt(cost.value - cost.budgetValue)}</span>
                </summary>
                <ul className="mt-2 space-y-2 text-xs">
                  {cost.swaps.map((sw) => (
                    <li key={sw.cardId}>
                      <p className="font-medium text-ink">{names.get(sw.cardId)}</p>
                      <p className="num text-ink-3">
                        {sw.from.label} {fmt(sw.from.unit!)} → {sw.to.label} {fmt(sw.to.unit!)} · save {fmt(sw.saving)}
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {cost.missingCopies > 0 && (
              <details className="mt-3 border-t border-rule pt-3" data-testid="still-to-buy">
                <summary className="cursor-pointer text-sm font-medium">Still to buy · {cost.missingCopies}</summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {cost.lines
                    .filter((l) => l.missing > 0)
                    .sort((a, b) => b.missingCost - a.missingCost)
                    .map((l) => (
                      <li key={l.cardId} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate">
                          <span className="num">{l.missing}×</span>{" "}
                          <Link href={`/cards/${l.cardId}?deck=${p.deckId}#watch`} className="hover:text-quill hover:underline" title="Watch the price">
                            {names.get(l.cardId)}
                          </Link>
                          {l.proxies > 0 && <span className="text-ink-3"> ({l.proxies} proxied)</span>}
                        </span>
                        <span className="num shrink-0 text-ink-2">{l.normal?.unit != null ? fmt(l.missingCost) : "—"}</span>
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </Panel>

          <Panel title="Curve & mix" testid="stats">
            <div className="h-28" role="img" aria-label={`Energy curve: ${stats.curve.map((c) => `${c.count} at ${c.energy}`).join(", ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.curve} margin={{ top: 14, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="energy" tickLine={false} axisLine={false} tick={{ fill: AXIS_TEXT, fontSize: 11, fontFamily: "var(--font-plex-mono)" }} />
                  <Tooltip cursor={{ fill: "rgba(22,24,29,0.04)" }} formatter={(v) => [`${v} cards`, "Count"]} labelFormatter={(l) => `${l} energy`} />
                  <Bar dataKey="count" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false}>
                    <LabelList dataKey="count" position="top" style={{ fill: AXIS_TEXT, fontSize: 10, fontFamily: "var(--font-plex-mono)" }} formatter={(v: unknown) => (Number(v) ? String(v) : "")} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-xs text-ink-3">
              Energy curve · average <span className="num">{stats.averageEnergy?.toFixed(2) ?? "—"}</span> over <span className="num">{stats.playables}</span> cards
            </p>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <Split title="Types" rows={stats.types} total={stats.playables} />
              <Split title="Domains" rows={stats.domains} total={stats.playables} />
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function sectionRule(rule: string): Section | null {
  return ({ LEGEND: "LEGEND", CHAMPION: "CHAMPION", MAIN_SIZE: "MAIN", RUNES: "RUNES", BATTLEFIELDS: "BATTLEFIELDS", SIDEBOARD: "SIDEBOARD" } as Record<string, Section>)[rule] ?? null;
}

function LegalBadge({ legal, count }: { legal: boolean; count: number }) {
  return (
    <span
      data-testid="legal-badge"
      className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium", legal ? "bg-gain-tint text-gain" : "bg-loss-tint text-loss")}
    >
      {legal ? <Check size={14} aria-hidden /> : <X size={14} aria-hidden />}
      {legal ? "Legal" : `${count} ${count === 1 ? "issue" : "issues"}`}
    </span>
  );
}

function Stepper({ value, onDec, onInc, label }: { value: number; onDec: () => void; onInc: () => void; label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-[var(--radius-control)] border border-rule bg-sheet">
      <button type="button" onClick={onDec} aria-label={`One fewer ${label}`} className="grid size-8 place-items-center text-ink-2 hover:bg-hover disabled:opacity-40" disabled={value <= 0}>
        <Minus size={13} />
      </button>
      <span className="num w-6 text-center text-sm font-medium" aria-live="polite">
        {value}
      </span>
      <button type="button" onClick={onInc} aria-label={`One more ${label}`} className="grid size-8 place-items-center text-ink-2 hover:bg-hover">
        <Plus size={13} />
      </button>
    </span>
  );
}

function Panel({ title, children, testid }: { title: string; children: React.ReactNode; testid?: string }) {
  return (
    <section className="rounded-[var(--radius-panel)] border border-rule bg-sheet p-4" data-testid={testid}>
      <h2 className="eyebrow mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, value, hint, strong, testid }: { label: string; value: string; hint?: string; strong?: boolean; testid?: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={cn("num mt-0.5", strong ? "text-base font-medium" : "text-ink")} data-testid={testid}>
        {value}
      </dd>
      {hint && <dd className="text-[11px] text-ink-3">{hint}</dd>}
    </div>
  );
}

function Split({ title, rows, total }: { title: string; rows: { key: string; count: number }[]; total: number }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-ink-2">{title}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.key} className="text-xs">
            <div className="flex justify-between">
              <span>{r.key}</span>
              <span className="num text-ink-3">{r.count}</span>
            </div>
            <div className="mt-0.5 h-1 rounded-full bg-inset">
              <div className="h-1 rounded-full bg-quill" style={{ width: `${total ? (r.count / total) * 100 : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CardAdder({ onAdd }: { onAdd: (cardId: string) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; type: string; setCode: string; imageUrl: string | null; domains: string }[]>([]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((r) => {
          setHits(r.cards ?? []);
          setActive(0);
        })
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);
  const pick = (id: string) => {
    onAdd(id);
    setQ("");
    setHits([]);
  };
  return (
    <div className="relative">
      <label htmlFor="deck-add" className="sr-only">
        Add a card
      </label>
      <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        id="deck-add"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && hits[active]) {
            e.preventDefault();
            pick(hits[active].id);
          } else if (e.key === "Escape") setHits([]);
        }}
        placeholder="Add a card — type a name, Enter adds one copy"
        autoComplete="off"
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-controls="deck-add-hits"
        className="h-11 w-full rounded-[var(--radius-panel)] border border-rule bg-inset pr-3 pl-9 text-[15px] placeholder:text-ink-4 hover:border-rule-strong focus:border-quill focus:bg-sheet focus:outline-none"
      />
      {hits.length > 0 && (
        <ul id="deck-add-hits" role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-[var(--radius-control)] border border-rule-strong bg-sheet py-1 shadow-[0_12px_32px_-12px_rgba(22,24,29,0.25)]">
          {hits.map((h, i) => (
            <li
              key={h.id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(h.id);
              }}
              className={cn("flex cursor-pointer items-center gap-3 px-2 py-1.5", i === active && "bg-hover")}
            >
              <span className="relative h-9 w-[26px] shrink-0 overflow-hidden rounded-[3px] bg-inset">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {h.imageUrl && <img src={h.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />}
                <DomainStripe domains={h.domains} className="absolute inset-x-0 top-0 h-[2px]" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{h.name}</span>
              <span className="num shrink-0 text-xs text-ink-3">
                {h.type} · {h.setCode}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


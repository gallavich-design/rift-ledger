import { describe, expect, it } from "vitest";
import { evaluateWatch, type WatchState } from "@/lib/alerts/watch";
import { wordDiff } from "./textDiff";
import { monthsUntil, nextRotation, priceImpact, rotationLabel } from "./rotation";

const base: WatchState = { targetPrice: 50000, targetDir: "BELOW", movePct: null, lastSide: null, lastMoveAlertDay: null };

describe("watch alerts", () => {
  it("fires when the price crosses below the target, once", () => {
    let s: WatchState = { ...base };
    const step = (price: number, day = "2026-10-26") => {
      const r = evaluateWatch(s, { day, price, priceWeekAgo: null });
      s = { ...s, lastSide: r.lastSide, lastMoveAlertDay: r.lastMoveAlertDay };
      return r.alerts;
    };
    expect(step(80000)).toEqual([]); // above target: nothing
    expect(step(40000)).toEqual([{ kind: "PRICE_TARGET", dir: "BELOW", target: 50000, price: 40000 }]);
    expect(step(39000)).toEqual([]); // still below: no repeat
    expect(step(60000)).toEqual([]); // back above: re-arms
    expect(step(50000)).toHaveLength(1); // reaching the target exactly counts
  });

  it("fires immediately if the first price seen is already past the target", () => {
    expect(evaluateWatch(base, { day: "2026-10-26", price: 30000, priceWeekAgo: null }).alerts).toHaveLength(1);
  });

  it("supports ABOVE targets", () => {
    const r = evaluateWatch({ ...base, targetDir: "ABOVE", lastSide: "BELOW" }, { day: "2026-10-26", price: 51000, priceWeekAgo: null });
    expect(r.alerts[0]).toMatchObject({ kind: "PRICE_TARGET", dir: "ABOVE" });
    expect(r.lastSide).toBe("ABOVE");
  });

  it("move alert: ±X% over 7 days, at most once a week", () => {
    const w: WatchState = { targetPrice: null, targetDir: null, movePct: 20, lastSide: null, lastMoveAlertDay: null };
    const up = evaluateWatch(w, { day: "2026-10-26", price: 1300, priceWeekAgo: 1000 });
    expect(up.alerts).toEqual([{ kind: "PRICE_MOVE", pct: 30, from: 1000, to: 1300 }]);
    expect(evaluateWatch({ ...w, lastMoveAlertDay: "2026-10-22" }, { day: "2026-10-26", price: 700, priceWeekAgo: 1000 }).alerts).toEqual([]);
    expect(evaluateWatch({ ...w, lastMoveAlertDay: "2026-10-19" }, { day: "2026-10-26", price: 700, priceWeekAgo: 1000 }).alerts[0]).toMatchObject({ pct: -30 });
    expect(evaluateWatch(w, { day: "2026-10-26", price: 1100, priceWeekAgo: 1000 }).alerts).toEqual([]);
  });

  it("does nothing without a price", () => {
    expect(evaluateWatch(base, { day: "2026-10-26", price: null, priceWeekAgo: null })).toEqual({ alerts: [], lastSide: null, lastMoveAlertDay: null });
  });
});

describe("errata word diff", () => {
  it("marks removed and added words", () => {
    const d = wordDiff("When you play me, draw 2 cards.", "When you play me, draw 1 card.");
    expect(d.filter((p) => p.type === "del").map((p) => p.text)).toEqual(["2", "cards."]);
    expect(d.filter((p) => p.type === "add").map((p) => p.text)).toEqual(["1", "card."]);
    expect(d.filter((p) => p.type !== "add").map((p) => p.text).join("")).toBe("When you play me, draw 2 cards.");
    expect(d.filter((p) => p.type !== "del").map((p) => p.text).join("")).toBe("When you play me, draw 1 card.");
  });
  it("handles identical and empty texts", () => {
    expect(wordDiff("Same text", "Same text")).toEqual([{ type: "same", text: "Same text" }]);
    expect(wordDiff("", "New")).toEqual([{ type: "add", text: "New" }]);
  });
});

describe("rotation", () => {
  it("counts whole months", () => {
    expect(monthsUntil("2026-10-26", "2028-01-01")).toBe(14);
    expect(monthsUntil("2026-10-26", "2026-11-26")).toBe(1);
    expect(monthsUntil("2026-10-26", "2026-11-25")).toBe(0);
  });
  it("labels", () => {
    expect(rotationLabel("2026-10-26", "2028-01-01")).toBe("rotates in 14 months");
    expect(rotationLabel("2026-10-26", "2026-11-27")).toBe("rotates in 1 month");
    expect(rotationLabel("2026-10-26", "2026-11-10")).toBe("rotates this month");
    expect(rotationLabel("2026-10-26", "2026-10-01")).toBe("rotated 2026-10-01");
    expect(rotationLabel("2026-10-26", "2028-01-01", true)).toBe("rotate in 14 months");
  });
  it("finds the next rotation", () => {
    expect(nextRotation("2026-10-26", [null, "2028-01-01", "2027-06-01", "2026-01-01"])).toBe("2027-06-01");
    expect(nextRotation("2026-10-26", [null])).toBeNull();
  });
  it("price impact: 30-day averages before and after", () => {
    const s = [
      { day: "2026-09-01", amount: 1000 },
      { day: "2026-09-20", amount: 1200 },
      { day: "2026-10-01", amount: 500 },
      { day: "2026-10-15", amount: 700 },
      { day: "2026-12-30", amount: 9999 },
    ];
    expect(priceImpact(s, "2026-10-01")).toEqual({ before: 1100, after: 600, changePct: (600 - 1100) / 11, pointsBefore: 2, pointsAfter: 2 });
  });
});

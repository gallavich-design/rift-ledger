import { describe, expect, it } from "vitest";
import { missingToAdd, type SetSlot } from "./binder";

const slot = (key: string, number: number, printings: { id: string; finish: string }[], extra: string[] = []): SetSlot => ({
  key,
  number,
  cardId: key,
  name: key,
  rarity: null,
  imageUrl: null,
  art: "STANDARD",
  landscape: false,
  printings,
  variantIds: [...printings.map((p) => p.id), ...extra],
});

describe("Complete the set", () => {
  const slots = [
    slot("c", 3, [{ id: "c-foil", finish: "FOIL" }]), // foil-only printing
    slot("a", 1, [
      { id: "a-foil", finish: "FOIL" },
      { id: "a-normal", finish: "NORMAL" },
    ]),
    slot("b", 2, [{ id: "b-normal", finish: "NORMAL" }], ["b-graded"]),
    slot("d", 4, [{ id: "d-normal", finish: "NORMAL" }]),
  ];

  it("adds one of each missing slot, normal finish where there is one, in number order", () => {
    expect(missingToAdd(slots, new Map()).map((t) => t.variantId)).toEqual(["a-normal", "b-normal", "c-foil", "d-normal"]);
  });

  it("skips slots you have in any finish, graded or foreign copy", () => {
    const owned = new Map([
      ["a-foil", 1],
      ["b-graded", 1],
      ["d-normal", 0],
    ]);
    expect(missingToAdd(slots, owned).map((t) => t.slot.key)).toEqual(["c", "d"]);
  });
});

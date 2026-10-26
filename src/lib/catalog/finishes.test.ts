import { describe, expect, it } from "vitest";
import { planFinishes } from "./finishes";
import { variantKey } from "./variantKey";

describe("planFinishes", () => {
  it("converts an unused NORMAL variant into FOIL for a foil-only printing", () => {
    expect(planFinishes([{ id: "n", finish: "NORMAL", referenced: false }], ["FOIL"])).toEqual({
      create: [],
      convert: [{ id: "n", to: "FOIL" }],
      remove: [],
    });
  });

  it("adds FOIL alongside NORMAL when both are sold", () => {
    expect(planFinishes([{ id: "n", finish: "NORMAL", referenced: false }], ["NORMAL", "FOIL"])).toEqual({
      create: ["FOIL"],
      convert: [],
      remove: [],
    });
  });

  it("never converts or removes a variant someone owns", () => {
    expect(planFinishes([{ id: "n", finish: "NORMAL", referenced: true }], ["FOIL"])).toEqual({
      create: ["FOIL"],
      convert: [],
      remove: [],
    });
  });

  it("removes an unused finish that TCGplayer no longer sells", () => {
    const plan = planFinishes(
      [
        { id: "n", finish: "NORMAL", referenced: false },
        { id: "f", finish: "FOIL", referenced: false },
      ],
      ["FOIL"],
    );
    expect(plan).toEqual({ create: [], convert: [], remove: ["n"] });
  });

  it("is a no-op when already in shape", () => {
    expect(planFinishes([{ id: "f", finish: "FOIL", referenced: false }], ["FOIL"])).toEqual({ create: [], convert: [], remove: [] });
  });
});

describe("variantKey", () => {
  it("formats printing|finish|language|grading|grade", () => {
    expect(variantKey({ sourceId: "abc", finish: "FOIL", language: "EN" })).toBe("abc|FOIL|EN||");
    expect(variantKey({ sourceId: "abc", finish: "NORMAL", language: "EN", gradingCompany: "PSA", grade: "10" })).toBe("abc|NORMAL|EN|PSA|10");
  });
});

import { describe, expect, it } from "vitest";
import { parseRules } from "./rulesText";

describe("parseRules", () => {
  it("splits paragraphs on <br> and </p><p>, and never keeps HTML", () => {
    const blocks = parseRules("<p>[Ganking] (I can move.)<br />I enter ready.</p><p>Second &gt; first</p>");
    expect(blocks.map((b) => b.kind)).toEqual(["para", "para", "para"]);
    expect(blocks[0].segments[0]).toEqual({ kind: "keyword", text: "Ganking" });
    expect(JSON.stringify(blocks)).not.toContain("<");
    expect(blocks[2].segments[0]).toEqual({ kind: "text", text: "Second > first" });
  });

  it("turns icon tokens into segments", () => {
    const [b] = parseRules("<p>Pay :rb_energy_2: and :rb_rune_fury:, :rb_exhaust: me for +1 :rb_might:.</p>");
    const icons = b.segments.filter((s) => s.kind === "icon");
    expect(icons).toEqual([
      { kind: "icon", icon: "energy", value: "2" },
      { kind: "icon", icon: "rune", value: "fury" },
      { kind: "icon", icon: "exhaust", value: "" },
      { kind: "icon", icon: "might", value: "" },
    ]);
  });

  it("keeps list items as bullets", () => {
    const blocks = parseRules("<p>Choose one —</p><ul><li>Draw 1.</li><li>Deal 2.</li></ul>");
    expect(blocks.map((b) => b.kind)).toEqual(["para", "bullet", "bullet"]);
  });

  it("strips script-like markup safely", () => {
    const blocks = parseRules('<p><img src=x onerror="alert(1)">Hi</p>');
    expect(blocks).toEqual([{ kind: "para", segments: [{ kind: "text", text: "Hi" }] }]);
  });
});

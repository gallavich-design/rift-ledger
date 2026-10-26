// Parses upstream rich rules text into safe segments (no HTML is ever injected).
// Upstream uses <p>, <br>, <ul>/<li>, [Keyword] brackets and :rb_*: icon tokens (profiled 2026-10-26).

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "keyword"; text: string }
  | { kind: "icon"; icon: "might" | "exhaust" | "energy" | "rune"; value: string };

export interface Block {
  kind: "para" | "bullet";
  segments: Segment[];
}

const ENTITIES: Record<string, string> = { "&gt;": ">", "&lt;": "<", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

export function parseRules(rich: string, plainFallback = ""): Block[] {
  const src = rich || plainFallback;
  if (!src) return [];
  const lines: { kind: Block["kind"]; text: string }[] = [];
  const marked = src
    .replace(/<li[^>]*>/gi, "\n\u0001")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e);
  for (const raw of marked.split("\n")) {
    const bullet = raw.startsWith("\u0001");
    const text = raw.replace("\u0001", "").trim();
    if (text) lines.push({ kind: bullet ? "bullet" : "para", text });
  }
  return lines.map((l) => ({ kind: l.kind, segments: tokenize(l.text) }));
}

function tokenize(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /(\[[^\]]+\])|(:rb_[a-z0-9_]+:)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1]) out.push({ kind: "keyword", text: m[1].slice(1, -1) });
    else out.push(iconSegment(m[2]));
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

function iconSegment(token: string): Segment {
  const name = token.slice(4, -1); // strip ":rb_" and ":"
  if (name === "might") return { kind: "icon", icon: "might", value: "" };
  if (name === "exhaust") return { kind: "icon", icon: "exhaust", value: "" };
  if (name.startsWith("energy_")) return { kind: "icon", icon: "energy", value: name.slice(7) };
  if (name.startsWith("rune_")) return { kind: "icon", icon: "rune", value: name.slice(5) };
  return { kind: "text", text: token };
}

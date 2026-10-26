import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseRules } from "@/lib/catalog/rulesText";

// Plain current rules text of a card (for prefilling errata "old text").
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const card = await db.card.findUnique({ where: { id: (await params).id }, select: { rulesText: true, rulesTextRich: true } });
  if (!card) return NextResponse.json({ error: "not found" }, { status: 404 });
  const text = parseRules(card.rulesTextRich, card.rulesText)
    .map((b) => b.segments.map((s) => (s.kind === "text" ? s.text : s.kind === "keyword" ? `[${s.text}]` : `:rb_${s.icon}${s.value ? "_" + s.value : ""}:`)).join(""))
    .join("\n");
  return NextResponse.json({ text });
}

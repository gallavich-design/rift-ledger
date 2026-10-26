// Shared helpers for the browser tests (all run against prisma/e2e.db).
import path from "node:path";
import { PrismaClient } from "@prisma/client";

export const E2E_DB_URL = `file:${path.resolve(__dirname, "../prisma/e2e.db")}`;
export const db = new PrismaClient({ datasources: { db: { url: E2E_DB_URL } } });

export const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
export const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const split = (s: string) => s.split("|").filter(Boolean);

/** Builds a legal Standard list from the real catalogue: 1 Legend, 1 Chosen Champion, 39 main, 12 runes, 3 battlefields. */
export async function legalList() {
  const legends = await db.card.findMany({ where: { type: "Legend", set: { standardLegal: true } }, include: { set: true } });
  for (const legend of legends) {
    const domains = split(legend.domains);
    const tags = split(legend.tags);
    const ok = (c: { domains: string }) => split(c.domains).every((d) => domains.includes(d) || d === "Colorless");
    const pool = await db.card.findMany({ where: { set: { standardLegal: true }, type: { in: ["Unit", "Spell", "Gear"] } }, orderBy: { name: "asc" } });
    const champ = pool.find((c) => c.type === "Unit" && c.supertype === "Champion" && split(c.tags).some((t) => tags.includes(t)) && ok(c));
    const main = pool.filter((c) => ok(c) && c.supertype !== "Champion" && c.supertype !== "Signature" && c.supertype !== "Token" && c.id !== champ?.id && !c.name.includes("//")).slice(0, 14);
    const spare = main.pop();
    const runes = await db.card.findMany({ where: { type: "Rune", supertype: "Basic" } });
    const bfs = await db.card.findMany({ where: { type: "Battlefield", set: { standardLegal: true } }, take: 3, orderBy: { name: "asc" } });
    const runeCards = domains.map((d) => runes.find((r) => split(r.domains)[0] === d));
    if (!champ || !spare || main.length < 13 || runeCards.some((r) => !r) || bfs.length < 3) continue;
    const text = [
      "Legend:",
      `1 ${legend.name}`,
      "Champion:",
      `1 ${champ.name}`,
      "Main deck:",
      ...main.map((c) => `3 ${c.name}`),
      "Runes:",
      ...runeCards.map((r) => `6 ${r!.name}`),
      "Battlefields:",
      ...bfs.map((b) => `1 ${b.name}`),
    ].join("\n");
    return { text, legend: legend.name, main: main.map((c) => c.name), runes: runeCards.map((r) => r!.name), spare: spare.name };
  }
  throw new Error("No legal deck could be built from the catalogue");
}


// Run before Playwright (npm run e2e). Browser tests run against prisma/e2e.db: a copy of the dev catalogue (cards, prices, FX) with
// every user-owned row removed. Test purchases and fixture prices never touch the real database.
import { copyFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const E2E_DB = path.resolve(__dirname, "../prisma/e2e.db");

async function main() {
  const src = path.resolve(__dirname, "../prisma/dev.db");
  if (!existsSync(src)) throw new Error("prisma/dev.db not found — run migrations, npm run sync:cards and npm run sync:prices first.");
  for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(E2E_DB + suffix, { force: true });
  copyFileSync(src, E2E_DB);
  const db = new PrismaClient({ datasources: { db: { url: `file:${E2E_DB}` } } });
  try {
    await db.user.deleteMany({}); // cascades to every user-owned table
    await db.rulingEvent.deleteMany({});
    await db.priceSnapshot.deleteMany({ where: { source: { in: ["DEMO", "MANUAL"] } } });
    const n = await db.priceSnapshot.count({ where: { source: "TCGPLAYER" } });
    if (!n) throw new Error("No TCGplayer prices in dev.db — run npm run sync:prices first.");
    // Tests reason about "today" and "yesterday": keep only the newest day of prices and file it under
    // today, so results don't depend on when dev.db was last synced.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
    for (const model of ["priceSnapshot", "sealedPriceSnapshot"] as const) {
      const m = db[model] as unknown as {
        findFirst(a: object): Promise<{ day: string } | null>;
        deleteMany(a: object): Promise<unknown>;
        updateMany(a: object): Promise<unknown>;
      };
      const newest = (await m.findFirst({ where: { source: "TCGPLAYER" }, orderBy: { day: "desc" }, select: { day: true } }))?.day;
      if (!newest) continue;
      await m.deleteMany({ where: { day: { not: newest } } });
      if (newest !== today) await m.updateMany({ where: { day: newest }, data: { day: today } });
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

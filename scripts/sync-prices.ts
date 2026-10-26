// Usage: npm run sync:prices [-- --day=YYYY-MM-DD]
// Run once a day after tcgcsv refreshes (~20:00 UTC = 03:00 Bangkok). Idempotent per day.
import { PrismaClient } from "@prisma/client";
import { runPriceJob } from "../src/lib/prices/job";

const db = new PrismaClient();
const dayArg = process.argv.find((a) => a.startsWith("--day="))?.slice(6);

runPriceJob(db, { day: dayArg })
  .then((r) => {
    console.log(
      `Prices for ${r.day}: ${r.snapshots} snapshots from ${r.products} TCGplayer products in ${r.groups} groups ` +
        `(${r.unmatchedPrices} unmatched — sealed or not in Riftcodex yet). Finishes: +${r.finishes.created} created, ` +
        `${r.finishes.converted} converted, ${r.finishes.removed} removed. ${r.ms} ms.`,
    );
    if (!("error" in r.fx)) console.log("FX:", r.fx.map((q) => `USD→${q.quote} ${(q.rateE6 / 1e6).toFixed(4)} (${q.asOf})`).join(", "));
    for (const w of r.warnings) console.warn("warning:", w);
  })
  .catch((e) => {
    console.error("Price job failed:", e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

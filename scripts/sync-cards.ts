// Usage: npm run sync:cards   (safe to run daily from cron — idempotent)
import { PrismaClient } from "@prisma/client";
import { syncCatalog } from "../src/lib/catalog/sync";
import { riftcodex } from "../src/lib/providers/riftcodex";

const db = new PrismaClient();

syncCatalog(db, riftcodex)
  .then((r) => {
    console.log(`Synced ${r.sets} sets, ${r.cards} cards, ${r.variants} printings (${r.removedVariants} removed) in ${r.ms} ms`);
  })
  .catch((e) => {
    console.error("Card sync failed:", e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

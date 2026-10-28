// Runs at server start (scripts/start-server.sh). If the catalogue is empty — a brand-new database —
// syncs cards and today's prices once. Otherwise does nothing; the daily schedule keeps data fresh.
import { PrismaClient } from "@prisma/client";
import { syncCatalog } from "../src/lib/catalog/sync";
import { catalogProvider } from "../src/lib/providers/catalog";
import { runPriceJob } from "../src/lib/prices/job";

const db = new PrismaClient();
(async () => {
  if ((await db.card.count()) > 0) return;
  console.log("[first-run] empty catalogue — syncing cards…");
  const c = await syncCatalog(db, catalogProvider());
  console.log("[first-run] cards synced", JSON.stringify(c).slice(0, 200));
  const p = await runPriceJob(db);
  console.log(`[first-run] prices for ${p.day}: ${p.snapshots} snapshots, ${p.sealedSnapshots} sealed`);
})()
  .catch((e) => console.error("[first-run] failed — use Settings → Sync now:", (e as Error).message))
  .finally(() => db.$disconnect());

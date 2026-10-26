// Usage: npx tsx scripts/verify-roundtrip.ts <export.json> <empty-db-file> [source]
// Creates a brand-new SQLite database, applies every migration, imports the export into a fresh
// owner account, and prints that account's portfolio totals — what the dashboard would show.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { importAll, reviveDates, type ExportFile } from "../src/lib/data/exportImport";
import { buildPortfolio } from "../src/lib/portfolio/full";
import { formatMoney } from "../src/lib/money/money";

const [file, dbFile, source = "TCGPLAYER"] = process.argv.slice(2);
if (!file || !dbFile) throw new Error("usage: verify-roundtrip <export.json> <db-file> [source]");
const url = `file:${path.resolve(dbFile)}`;
rmSync(path.resolve(dbFile), { force: true });
execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });

const db = new PrismaClient({ datasources: { db: { url } } });
(async () => {
  const owner = await db.user.create({ data: { email: "owner@local", name: "Owner", settings: { create: {} } } });
  const data = JSON.parse(readFileSync(file, "utf8"), reviveDates) as ExportFile;
  const summary = await importAll(db, owner.id, data);
  const pf = await buildPortfolio(db, owner.id, { source });
  if (!pf.ok) throw new Error(`missing FX ${pf.missing.join(",")}`);
  console.log(JSON.stringify({ summary, display: pf.display, value: pf.totals.value, cost: pf.totals.cost, realized: pf.totals.realized, formatted: formatMoney(pf.totals.value, pf.display) }));
  await db.$disconnect();
})();

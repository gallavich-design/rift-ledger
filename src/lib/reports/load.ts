import { db } from "@/lib/db";
import { getCurrentUserId, isDemoMode } from "@/lib/currentUser";
import { availableSources } from "@/lib/portfolio/data";
import { valuationSource } from "@/lib/prices/quote";
import { buildPortfolio } from "@/lib/portfolio/full";
import { buildReport } from "./valueReport";

/** Report data for the current user, using the same source choice as the dashboard. */
export async function loadReport(requested?: string | null) {
  const userId = await getCurrentUserId();
  const demo = await isDemoMode();
  const sources = await availableSources(db, userId, demo);
  const source = requested && sources.includes(requested) ? requested : await valuationSource(db, userId, demo);
  const pf = await buildPortfolio(db, userId, { source });
  return { sources, source, pf, report: pf.ok ? buildReport(pf) : null };
}

import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { runPriceJob } from "@/lib/prices/job";

// Daily price snapshot (idempotent per day). Same auth as /api/cron/sync-cards.
// Without CRON_SECRET set, it only runs in development or with RIFT_LEDGER_OPEN=1.
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: process.env.CRON_SECRET ? "unauthorized" : "set CRON_SECRET" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await runPriceJob(db)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}

export const GET = POST; // Vercel Cron issues GET requests

import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { syncCatalog } from "@/lib/catalog/sync";
import { riftcodex } from "@/lib/providers/riftcodex";

// Daily catalogue refresh. Call with `Authorization: Bearer $CRON_SECRET` (e.g. Vercel Cron).
// Without CRON_SECRET set, it only runs in development or with RIFT_LEDGER_OPEN=1.
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: process.env.CRON_SECRET ? "unauthorized" : "set CRON_SECRET" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await syncCatalog(db, riftcodex)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}

export const GET = POST; // Vercel Cron issues GET requests

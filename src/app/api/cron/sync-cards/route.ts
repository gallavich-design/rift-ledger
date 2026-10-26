import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncCatalog } from "@/lib/catalog/sync";
import { riftcodex } from "@/lib/providers/riftcodex";

// Daily catalogue refresh. Call with `Authorization: Bearer $CRON_SECRET` (e.g. Vercel Cron).
// Without CRON_SECRET set, only localhost may call it.
export const maxDuration = 300;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  } else {
    const host = new URL(req.url).hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(host)) return NextResponse.json({ error: "set CRON_SECRET" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await syncCatalog(db, riftcodex)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}

export const GET = POST; // Vercel Cron issues GET requests

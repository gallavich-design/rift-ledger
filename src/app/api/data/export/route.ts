import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/currentUser";
import { exportAll } from "@/lib/data/exportImport";
import { lotsCsv, salesCsv } from "@/lib/data/csv";
import { dayKey } from "@/config/app";

export const dynamic = "force-dynamic";

// GET /api/data/export?format=json|lots|sales
export async function GET(req: Request) {
  const format = new URL(req.url).searchParams.get("format") ?? "json";
  const userId = await getCurrentUserId();
  const day = dayKey();
  if (format === "lots" || format === "sales") {
    const body = format === "lots" ? await lotsCsv(db, userId) : await salesCsv(db, userId);
    return new NextResponse(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="rift-ledger-${format}-${day}.csv"` } });
  }
  const data = await exportAll(db, userId);
  return new NextResponse(JSON.stringify(data), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="rift-ledger-export-${day}.json"` } });
}

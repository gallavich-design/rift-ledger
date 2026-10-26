import { NextResponse } from "next/server";
import { TEMPLATE_CSV } from "@/lib/import/rows";

export function GET() {
  return new NextResponse(TEMPLATE_CSV, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="rift-ledger-import-template.csv"' } });
}

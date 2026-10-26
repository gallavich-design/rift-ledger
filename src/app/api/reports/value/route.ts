import { NextResponse } from "next/server";
import { loadReport } from "@/lib/reports/load";
import { reportCsv } from "@/lib/reports/valueReport";
import { renderReportPdf } from "@/lib/reports/pdf";
import { dayKey } from "@/config/app";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/reports/value?format=pdf|csv&source=TCGPLAYER[&images=0]
export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "pdf";
  const { report, pf } = await loadReport(url.searchParams.get("source"));
  if (!report) return NextResponse.json({ error: `Missing exchange rate for ${pf.ok ? "" : pf.missing.join(", ")}` }, { status: 409 });
  const name = `rift-ledger-value-${dayKey()}`;
  if (format === "csv") {
    return new NextResponse(reportCsv(report), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"`, "x-report-total": String(report.totals.value) } });
  }
  const pdf = await renderReportPdf(report, { images: url.searchParams.get("images") !== "0" });
  return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}.pdf"`, "x-report-total": String(report.totals.value) } });
}

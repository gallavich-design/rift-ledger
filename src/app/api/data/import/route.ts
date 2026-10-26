import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUserId, isDemoMode } from "@/lib/currentUser";
import { ImportError, importAll, reviveDates, type ExportFile } from "@/lib/data/exportImport";

export const dynamic = "force-dynamic";

// POST the export JSON as the request body. Same-origin only.
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ ok: false, message: "Cross-site import blocked." }, { status: 403 });
  if (await isDemoMode()) return NextResponse.json({ ok: false, message: "Exit demo mode before importing your data." }, { status: 400 });
  let file: ExportFile;
  try {
    file = JSON.parse(await req.text(), reviveDates) as ExportFile;
  } catch {
    return NextResponse.json({ ok: false, message: "That file isn't valid JSON." }, { status: 400 });
  }
  try {
    const summary = await importAll(db, await getCurrentUserId(), file);
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    const msg = e instanceof ImportError ? e.message : `Import failed and nothing was changed: ${(e as Error).message.split("\n").slice(-1)[0]}`;
    return NextResponse.json({ ok: false, message: msg }, { status: 400 });
  }
}

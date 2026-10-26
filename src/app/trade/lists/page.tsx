import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getCurrentUserId, isDemoMode } from "@/lib/currentUser";
import { loadTradeLists } from "@/lib/trade/lists";
import { PageHeader } from "@/components/ui/PageHeader";
import { TradeTabs } from "../TradeTabs";
import { ListsEditor } from "./ListsEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Haves & wants" };

export default async function ListsPage() {
  const userId = await getCurrentUserId();
  const [lists, settings] = await Promise.all([loadTradeLists(db, userId, await isDemoMode()), db.settings.findUnique({ where: { userId } })]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  return (
    <div className="mx-auto max-w-[1080px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader title="Trade" description="Keep a list of cards you'll trade away and cards you're hunting, and share it with a link." />
      <TradeTabs active="lists" />
      <ListsEditor {...lists} shareUrl={settings?.tradeShareToken ? `${origin}/share/trade/${settings.tradeShareToken}` : null} />
    </div>
  );
}

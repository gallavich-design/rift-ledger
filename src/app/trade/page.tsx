import { db } from "@/lib/db";
import { getCurrentUserId, isDemoMode } from "@/lib/currentUser";
import { getSettings } from "@/lib/portfolio/data";
import { valuationSource } from "@/lib/prices/quote";
import { SOURCE_LABEL } from "@/lib/domain/enums";
import { PageHeader } from "@/components/ui/PageHeader";
import { toPicked } from "@/lib/trade/picked";
import { TradeTabs } from "./TradeTabs";
import { TradeCalculator } from "./TradeCalculator";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trade" };

export default async function TradePage() {
  const userId = await getCurrentUserId();
  const settings = await getSettings(db, userId);
  const source = await valuationSource(db, userId, await isDemoMode());
  const items = await db.tradeListItem.findMany({ where: { userId }, include: { variant: { include: { card: true, set: true } } }, orderBy: { createdAt: "asc" } });
  return (
    <div className="mx-auto max-w-[1080px] px-4 py-6 md:px-8 md:py-8">
      <PageHeader title="Trade" description={<>Prices are {SOURCE_LABEL[source] ?? source} in {settings.displayCurrency} — the same numbers as on each card&rsquo;s page.</>} />
      <TradeTabs active="calc" />
      <TradeCalculator
        currency={settings.displayCurrency}
        conditions={settings.conditionMultipliers}
        haves={items.filter((i) => i.kind === "HAVE").map((i) => ({ quantity: i.quantity, variant: toPicked(i.variant) }))}
        wants={items.filter((i) => i.kind === "WANT").map((i) => ({ quantity: i.quantity, variant: toPicked(i.variant) }))}
      />
    </div>
  );
}

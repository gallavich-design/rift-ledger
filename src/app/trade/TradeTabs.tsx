import Link from "next/link";
import { cn } from "@/lib/ui";

const TABS = [
  { key: "calc", label: "Calculator", href: "/trade" },
  { key: "lists", label: "Haves & wants", href: "/trade/lists" },
] as const;

export function TradeTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Trade" className="mb-5 flex gap-1 border-b border-rule">
      {TABS.map((t) => (
        <Link key={t.key} href={t.href} aria-current={active === t.key ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 pb-2 text-sm", active === t.key ? "border-quill font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

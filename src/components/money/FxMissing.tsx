import Link from "next/link";

export function FxMissing() {
  return (
    <div role="alert" className="mt-6 rounded-[var(--radius-panel)] border border-caution/30 bg-caution-tint px-5 py-4 text-sm text-caution">
      <p className="font-medium">No exchange rate yet</p>
      <p className="mt-1">
        Values are converted for display using a daily rate. Run the price job, or enter a rate yourself in{" "}
        <Link href="/settings#money" className="underline">
          Settings
        </Link>
        .
      </p>
    </div>
  );
}

import { EmptyState } from "@/components/ui/EmptyState";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-10">
      <EmptyState title="Not found" body="That page or card isn't in the ledger." action={{ href: "/cards", label: "Back to cards" }} />
    </div>
  );
}

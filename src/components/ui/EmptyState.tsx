import Link from "next/link";

export function EmptyState({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="mt-6 rounded-[var(--radius-panel)] border border-dashed border-rule-strong px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-3">{body}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-4 inline-flex h-9 items-center rounded-[var(--radius-control)] bg-quill px-4 text-sm font-medium text-quill-ink hover:bg-quill/90"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

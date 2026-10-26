import { wordDiff } from "@/lib/rulings/textDiff";

/** Old vs new rules text, with removed words struck through and added words underlined (never colour alone). */
export function ErrataDiff({ oldText, newText }: { oldText: string; newText: string }) {
  const parts = wordDiff(oldText, newText);
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="errata-diff">
      <div>
        <p className="eyebrow mb-1">Before</p>
        <p className="rounded-[var(--radius-control)] bg-inset px-3 py-2 text-sm leading-relaxed whitespace-pre-line">
          {parts
            .filter((p) => p.type !== "add")
            .map((p, i) =>
              p.type === "del" ? (
                <del key={i} className="bg-loss-tint text-loss decoration-loss/60" aria-label={`removed: ${p.text}`}>
                  {p.text}
                </del>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
        </p>
      </div>
      <div>
        <p className="eyebrow mb-1">After</p>
        <p className="rounded-[var(--radius-control)] bg-inset px-3 py-2 text-sm leading-relaxed whitespace-pre-line">
          {parts
            .filter((p) => p.type !== "del")
            .map((p, i) =>
              p.type === "add" ? (
                <ins key={i} className="bg-gain-tint text-gain underline decoration-gain/60 underline-offset-2" aria-label={`added: ${p.text}`}>
                  {p.text}
                </ins>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
        </p>
      </div>
    </div>
  );
}

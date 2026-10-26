"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Segmented, TextField } from "@/components/ui/fields";
import { cn } from "@/lib/ui";
import { createDeck, importDeck } from "../actions";

const EXAMPLE = `Legend:
1 Jinx - Loose Cannon

Champion:
1 Jinx - Rebel

Main Deck:
3 Jinx - Rebel
…

Runes:
6 Fury Rune
6 Chaos Rune

Battlefields:
1 …`;

export function NewDeckForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"import" | "empty">("import");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      noValidate
      className="space-y-5 rounded-[var(--radius-panel)] border border-rule bg-sheet p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = mode === "import" ? await importDeck({ name, text }) : await createDeck({ name });
          if (r.ok) router.push(`/decks/${r.data.deckId}`);
          else {
            setErrors(r.fieldErrors ?? {});
            setMsg(r.message);
          }
        });
      }}
    >
      <Segmented
        label="Start from"
        name="mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: "import", label: "Paste a decklist" },
          { value: "empty", label: "Empty deck" },
        ]}
      />
      <TextField label="Deck name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="e.g. Jinx aggro" maxLength={80} />
      {mode === "import" && (
        <div>
          <label htmlFor="decklist" className="mb-1.5 block text-sm font-medium">
            Decklist
          </label>
          <textarea
            id="decklist"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            placeholder={EXAMPLE}
            aria-invalid={!!errors.text}
            aria-describedby="decklist-hint"
            className={cn(
              "num w-full rounded-[var(--radius-control)] border bg-inset px-3 py-2 text-[13px] leading-relaxed placeholder:text-ink-4 hover:border-rule-strong focus:border-quill focus:bg-sheet focus:outline-none",
              errors.text ? "border-loss" : "border-rule",
            )}
          />
          {errors.text ? (
            <p className="mt-1 text-sm text-loss">{errors.text}</p>
          ) : (
            <p id="decklist-hint" className="mt-1 text-xs text-ink-3">
              One card per line: “3 Card name”, “3x Card name” or “Card name x3”. Section headers are optional — Legends, runes and battlefields are sorted by type. Typos are fine; anything that can&apos;t be matched is listed for you to fix.
            </p>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : mode === "import" ? "Import deck" : "Create deck"}
        </Button>
        {msg && (
          <p role="alert" className="text-sm text-loss">
            {msg}
          </p>
        )}
      </div>
    </form>
  );
}

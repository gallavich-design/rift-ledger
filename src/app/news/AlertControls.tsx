"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui";
import { markAlertRead, markAllRead } from "./actions";

export function MarkAllRead() {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(() => markAllRead())}>
      Mark all as read
    </Button>
  );
}

export function AlertRow({ id, read, title, body, href, type, when, icon }: { id: string; read: boolean; title: string; body: string; href?: string; type: string; when: string; icon: React.ReactNode }) {
  const [pending, start] = useTransition();
  const tone = type.startsWith("RULING_BAN") ? "text-loss" : type.startsWith("RULING") ? "text-caution" : "text-quill";
  return (
    <li className={cn("flex gap-3 border-b border-rule-soft px-4 py-3 last:border-b-0", !read && "bg-quill-tint/40")} data-testid="alert" data-read={read}>
      <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-sheet ring-1 ring-rule", tone)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", !read && "font-medium")}>
          {!read && <span className="sr-only">Unread: </span>}
          {href ? (
            <Link href={href} onClick={() => !read && start(() => markAlertRead(id))} className="hover:text-quill hover:underline">
              {title}
            </Link>
          ) : (
            title
          )}
        </p>
        <p className="mt-0.5 text-sm text-ink-2">{body}</p>
        <p className="num mt-1 text-xs text-ink-3">{new Date(when).toLocaleString("en-GB", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" })}</p>
      </div>
      <button type="button" disabled={pending} onClick={() => start(() => markAlertRead(id, !read))} className="h-fit shrink-0 text-xs text-ink-3 hover:text-ink">
        {read ? "Mark unread" : "Mark read"}
      </button>
    </li>
  );
}

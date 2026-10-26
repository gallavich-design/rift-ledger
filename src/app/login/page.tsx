import { redirect } from "next/navigation";
import { authConfig } from "@/lib/auth/session";
import { LedgerMark } from "@/components/shell/AppShell";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (!authConfig().password) redirect("/dashboard"); // no password set → local, open install
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[360px]">
        <div className="mb-6 flex items-center gap-2">
          <LedgerMark />
          <span className="text-[17px] font-semibold tracking-[-0.01em]">Rift Ledger</span>
        </div>
        <div className="rounded-[var(--radius-panel)] border border-rule bg-sheet p-5">
          <h1 className="text-lg font-semibold">Sign in</h1>
          <p className="mt-1 mb-4 text-sm text-ink-3">This collection is private. Enter the app password.</p>
          <LoginForm next={next ?? ""} />
        </div>
        <p className="mt-4 text-center text-xs text-ink-3">Shared deck and trade links open without signing in.</p>
      </div>
    </div>
  );
}

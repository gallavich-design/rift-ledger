"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, authConfig, createSession, safeEqual, safeNext } from "@/lib/auth/session";

// Slows down password guessing: each failure from an address adds a second, up to 10 s (resets on success).
const failures = new Map<string, number>();

export async function signIn(_prev: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  const { password, secret } = authConfig();
  if (!password || !secret) return { error: "Sign-in isn't set up: APP_PASSWORD is empty." };
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const n = failures.get(ip) ?? 0;
  if (n) await new Promise((r) => setTimeout(r, Math.min(n, 10) * 1000));

  if (!safeEqual(String(form.get("password") ?? ""), password)) {
    failures.set(ip, n + 1);
    return { error: "That password isn't right." };
  }
  failures.delete(ip);
  const s = await createSession(secret);
  const proto = h.get("x-forwarded-proto") ?? "http";
  (await cookies()).set(SESSION_COOKIE, s.value, { httpOnly: true, sameSite: "lax", secure: proto === "https", path: "/", expires: s.expires });
  redirect(safeNext(String(form.get("next") ?? "")));
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

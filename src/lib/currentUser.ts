// v1 runs single-user. Every user-owned row still carries a userId so Auth.js can slot in later
// (tracked in NEXT.md). Until then, requests act as the local owner — or, while demo mode is on
// (cookie set from Settings → Load demo data), as a separate demo account whose data never mixes
// with the owner's.

import { cookies } from "next/headers";
import { db } from "./db";

const LOCAL_EMAIL = "owner@local";
export const DEMO_EMAIL = "demo@local";
export const DEMO_COOKIE = "rl_demo";

export async function getOwnerId(): Promise<string> {
  const user = await db.user.upsert({
    where: { email: LOCAL_EMAIL },
    update: {},
    create: { email: LOCAL_EMAIL, name: "Owner", settings: { create: {} } },
    select: { id: true },
  });
  return user.id;
}

export async function isDemoMode(): Promise<boolean> {
  try {
    return (await cookies()).get(DEMO_COOKIE)?.value === "1";
  } catch {
    return false; // outside a request (scripts, tests)
  }
}

export async function getCurrentUserId(): Promise<string> {
  if (await isDemoMode()) {
    const demo = await db.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
    if (demo) return demo.id;
  }
  return getOwnerId();
}

// v1 runs single-user. Every user-owned row still carries a userId so Auth.js can slot in later
// (tracked in NEXT.md). Until then, all requests act as the local owner account.

import { db } from "./db";

const LOCAL_EMAIL = "owner@local";

export async function getCurrentUserId(): Promise<string> {
  const user = await db.user.upsert({
    where: { email: LOCAL_EMAIL },
    update: {},
    create: { email: LOCAL_EMAIL, name: "Owner", settings: { create: {} } },
    select: { id: true },
  });
  return user.id;
}

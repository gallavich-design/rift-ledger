import { describe, expect, it } from "vitest";
import { authConfig, createSession, isPublicPath, openWithoutPassword, safeEqual, safeNext, verifySession } from "./session";

describe("sign-in session", () => {
  it("accepts its own cookie and rejects tampering, expiry and other secrets", async () => {
    const now = Date.UTC(2026, 9, 26);
    const s = await createSession("secret-a", now);
    expect(await verifySession(s.value, "secret-a", now + 1000)).toBe(true);
    expect(await verifySession(s.value, "secret-b", now + 1000)).toBe(false);
    const [exp, sig] = s.value.split(".");
    expect(await verifySession(`${Number(exp) + 1}.${sig}`, "secret-a", now)).toBe(false); // extended expiry
    expect(await verifySession(s.value, "secret-a", s.expires.getTime() + 1)).toBe(false); // expired
    expect(await verifySession(undefined, "secret-a", now)).toBe(false);
    expect(await verifySession("garbage", "secret-a", now)).toBe(false);
  });

  it("derives the key from the password when AUTH_SECRET is unset", () => {
    expect(authConfig({ APP_PASSWORD: " hunter2 " })).toEqual({ password: "hunter2", secret: "pw:hunter2" });
    expect(authConfig({ APP_PASSWORD: "x", AUTH_SECRET: "s" }).secret).toBe("s");
    expect(authConfig({}).password).toBeNull();
  });

  it("is open only in development or with an explicit opt-out", () => {
    expect(openWithoutPassword({ NODE_ENV: "development" })).toBe(true);
    expect(openWithoutPassword({ NODE_ENV: "production" })).toBe(false);
    expect(openWithoutPassword({ NODE_ENV: "production", RIFT_LEDGER_OPEN: "1" })).toBe(true);
  });

  it("keeps share links, cron and PWA files public — and nothing else", () => {
    for (const p of ["/login", "/share/deck/abc", "/share/trade/xyz", "/api/cron/sync-prices", "/manifest.webmanifest", "/sw.js", "/icons/icon-192.png"]) expect(isPublicPath(p)).toBe(true);
    for (const p of ["/", "/dashboard", "/api/data/export", "/api/reports/value", "/settings", "/shared", "/sharex"]) expect(isPublicPath(p)).toBe(false);
  });

  it("only redirects within the app after sign-in", () => {
    expect(safeNext("/decks/1?x=2")).toBe("/decks/1?x=2");
    expect(safeNext("//evil.example")).toBe("/dashboard");
    expect(safeNext("https://evil.example")).toBe("/dashboard");
    expect(safeNext("/login")).toBe("/dashboard");
    expect(safeNext(null)).toBe("/dashboard");
  });

  it("compares strings in full", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("cron endpoints", () => {
  it("need the bearer secret when set, and are closed on a production server without one", async () => {
    const { cronAuthorized } = await import("./session");
    expect(cronAuthorized("Bearer s3", { CRON_SECRET: "s3", NODE_ENV: "production" })).toBe(true);
    expect(cronAuthorized("Bearer nope", { CRON_SECRET: "s3", NODE_ENV: "production" })).toBe(false);
    expect(cronAuthorized(null, { NODE_ENV: "production" })).toBe(false);
    expect(cronAuthorized(null, { NODE_ENV: "development" })).toBe(true);
  });
});

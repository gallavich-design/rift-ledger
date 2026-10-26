// Single-owner sign-in (v1 is single-user). One password from APP_PASSWORD; a signed, expiring session
// cookie. Uses Web Crypto only, so it runs in middleware (edge) and in server actions alike.
//
// Cookie value: "<expiresAtMs>.<base64url HMAC-SHA256(expiresAtMs)>". The HMAC key is AUTH_SECRET, or a
// hash of APP_PASSWORD when AUTH_SECRET isn't set — so changing the password signs everyone out.

export const SESSION_COOKIE = "rl_session";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function authConfig(env: Record<string, string | undefined> = process.env) {
  const password = env.APP_PASSWORD?.trim() || null;
  return { password, secret: env.AUTH_SECRET?.trim() || (password ? `pw:${password}` : null) };
}

async function key(secret: string) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function sign(payload: string, secret: string) {
  return b64url(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(payload)));
}

/** Constant-time string comparison (lengths are not secret here). */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function createSession(secret: string, now = Date.now()): Promise<{ value: string; expires: Date }> {
  const exp = now + SESSION_DAYS * 86_400_000;
  return { value: `${exp}.${await sign(String(exp), secret)}`, expires: new Date(exp) };
}

export async function verifySession(value: string | undefined, secret: string, now = Date.now()): Promise<boolean> {
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  return safeEqual(sig, await sign(exp, secret));
}

/** Paths anyone may open: sign-in, read-only share links, cron (has its own bearer token), PWA files. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/share/") ||
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/icons/") ||
    ["/manifest.webmanifest", "/icon.svg", "/sw.js", "/offline.html", "/favicon.ico", "/robots.txt"].includes(pathname)
  );
}

/**
 * Whether the app may run without a password. Development is always open. A production server needs
 * APP_PASSWORD, or an explicit RIFT_LEDGER_OPEN=1 for a trusted machine/LAN (never on the internet).
 * The Host header is not trusted for this — clients can set it.
 */
export function openWithoutPassword(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production" || env.RIFT_LEDGER_OPEN === "1";
}

/** Only allow redirects back into this app after sign-in. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/dashboard";
}

/**
 * Cron endpoints: with CRON_SECRET, require `Authorization: Bearer <secret>`. Without it, they only
 * run where the whole app is open (development, or RIFT_LEDGER_OPEN=1) — never on a public server.
 */
export function cronAuthorized(authorization: string | null, env: Record<string, string | undefined> = process.env): boolean {
  const secret = env.CRON_SECRET?.trim();
  if (secret) return safeEqual(authorization ?? "", `Bearer ${secret}`);
  return openWithoutPassword(env);
}

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authConfig, isPublicPath, openWithoutPassword, verifySession } from "@/lib/auth/session";

// Sign-in gate. With APP_PASSWORD set, every page and API needs a session except public paths
// (share links, cron, PWA files). Without it, `npm run dev` is open; a production server answers 503
// with setup instructions unless RIFT_LEDGER_OPEN=1 — so it can't be exposed by accident.
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const { password, secret } = authConfig();

  if (!password) {
    if (openWithoutPassword() || isPublicPath(pathname)) return NextResponse.next();
    return new NextResponse(
      "Rift Ledger is not protected. Set APP_PASSWORD (and AUTH_SECRET) in the environment and restart — see README → Deploy. For a trusted local machine only, RIFT_LEDGER_OPEN=1 runs it without a password.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
  if (isPublicPath(pathname)) return NextResponse.next();
  if (await verifySession(req.cookies.get(SESSION_COOKIE)?.value, secret!)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

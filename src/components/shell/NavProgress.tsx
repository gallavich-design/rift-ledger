"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin bar along the top that appears the moment you click an in-app link and goes away when the
 * new page arrives — so a slow server never looks like a dead click. Doesn't touch page state
 * (unlike a route-level loading.tsx, which would remount forms while they're being used).
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = useState(false);

  useEffect(() => setActive(false), [pathname, search]);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(false), 15_000); // never stick around if a navigation is abandoned
    return () => clearTimeout(t);
  }, [active]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page / hash link
      setActive(true);
    }
    // Capture phase: Next's <Link> calls preventDefault in its own handler, which runs first otherwise.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return <div aria-hidden className="nav-progress" data-active={active ? "1" : "0"} />;
}

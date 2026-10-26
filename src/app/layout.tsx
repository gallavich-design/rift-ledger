import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Thai } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import { ServiceWorker } from "@/components/shell/ServiceWorker";
import { getCurrentUserId, isDemoMode } from "@/lib/currentUser";
import { db } from "@/lib/db";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const plexThai = IBM_Plex_Sans_Thai({ variable: "--font-plex-thai", subsets: ["thai"], weight: ["400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Rift Ledger", template: "%s · Rift Ledger" },
  description: "Riftbound collection, portfolio and deck tracker",
  applicationName: "Rift Ledger",
  appleWebApp: { capable: true, title: "Rift Ledger", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#fbfaf7",
  colorScheme: "light",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let unread = 0;
  try {
    unread = await db.alert.count({ where: { userId: await getCurrentUserId(), read: false } });
  } catch {
    unread = 0; // database not migrated yet — the shell still renders
  }
  return (
    <html lang="en" className={`${plexSans.variable} ${plexThai.variable} ${plexMono.variable}`}>
      <body>
        <AppShell demo={await isDemoMode()} unread={unread}>{children}</AppShell>
        <ServiceWorker />
      </body>
    </html>
  );
}

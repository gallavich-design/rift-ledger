import {
  BookOpen,
  Bell,
  Boxes,
  Eye,
  FileText,
  Layers,
  LayoutDashboard,
  Library,
  Repeat,
  Settings,
  Swords,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Phase in which the screen ships. Unbuilt screens render as non-links (spec §0.9). */
  readyIn: number;
}

// Spec §6 order. "Cards" is the Phase 1 catalog; it becomes part of Collection in Phase 2.
export const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, readyIn: 2 },
  { label: "Cards", href: "/cards", icon: BookOpen, readyIn: 1 },
  { label: "Collection", href: "/collection", icon: Library, readyIn: 2 },
  { label: "Decks", href: "/decks", icon: Layers, readyIn: 3 },
  { label: "Meta", href: "/meta", icon: Swords, readyIn: 4 },
  { label: "Watchlist", href: "/watchlist", icon: Eye, readyIn: 4 },
  { label: "News & Alerts", href: "/news", icon: Bell, readyIn: 4 },
  { label: "Sealed", href: "/sealed", icon: Boxes, readyIn: 5 },
  { label: "Trade", href: "/trade", icon: Repeat, readyIn: 5 },
  { label: "Reports", href: "/reports", icon: FileText, readyIn: 5 },
  { label: "Settings", href: "/settings", icon: Settings, readyIn: 1 },
];

export const CURRENT_PHASE = 1;

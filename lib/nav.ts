import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
  BookOpen,
  RefreshCw,
  Scale,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavId =
  "issue" | "receipt" | "karigars" | "ledger" | "stock" | "alerts" | "sync";

export const NAV: Record<
  NavId,
  { href: string; label: string; icon: LucideIcon }
> = {
  issue: { href: "/issue", label: "Issue", icon: ArrowUpFromLine },
  receipt: { href: "/receipt", label: "Receipt", icon: ArrowDownToLine },
  karigars: { href: "/karigars", label: "Karigars", icon: Users },
  ledger: { href: "/ledger", label: "Ledger", icon: BookOpen },
  stock: { href: "/stock", label: "Stock", icon: Scale },
  alerts: { href: "/alerts", label: "Alerts", icon: Bell },
  sync: { href: "/sync", label: "Sync", icon: RefreshCw },
};

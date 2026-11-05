import type { Role } from "./authz";
import type { NavId } from "./nav";

export const NAV_BY_ROLE: Record<Role, NavId[]> = {
  clerk: ["issue", "receipt", "karigars", "ledger", "sync"],
  finance: ["stock", "ledger", "alerts", "karigars"],
  partner: ["stock", "alerts", "ledger"],
  karigar: ["ledger"],
};

export const LANDING_BY_ROLE: Record<Role, string> = {
  clerk: "/issue",
  finance: "/stock",
  partner: "/stock",
  karigar: "/ledger",
};

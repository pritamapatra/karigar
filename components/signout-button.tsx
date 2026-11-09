"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { listQueue, type Owner } from "@/lib/offline/store";

export function SignoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signout() {
    if (busy) return;
    if (!navigator.onLine) {
      setError(
        "Reconnect before signing out. Local work remains on this tablet.",
      );
      return;
    }
    setBusy(true);
    setError(null);

    async function perform() {
      const response = await fetch("/api/session", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(
          "Could not verify the session. Reconnect and try again.",
        );
      }
      const owner = (await response.json()) as Owner;
      const entries = await listQueue(owner);
      const unsynced = entries.filter(
        (entry) => entry.status !== "synced",
      ).length;

      const warning = [
        unsynced
          ? `${unsynced} entries are not synced.`
          : "No queued entries are waiting.",
        "Drafts and local entries remain on this tablet under your account.",
        "They are not encrypted by this app. Other device users with browser-storage access may inspect them.",
        "Sign out without deleting local work?",
      ].join("\n");

      if (!window.confirm(warning)) return;

      const result = await fetch("/auth/signout", { method: "POST" });
      if (!result.ok) throw new Error("Sign-out was not confirmed. Try again.");
      router.replace("/login");
      router.refresh();
    }

    try {
      if (navigator.locks) {
        // Determine the lock name, then recheck the account after acquiring it.
        const response = await fetch("/api/session", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not verify the session.");
        const owner = (await response.json()) as Owner;
        await navigator.locks.request(
          `karigar-sync:${JSON.stringify([owner.orgId, owner.userId])}`,
          async () => {
            const current = await fetch("/api/session", { cache: "no-store" });
            if (!current.ok)
              throw new Error("Account changed. Refresh before signing out.");
            const active = (await current.json()) as Owner;
            if (
              active.userId !== owner.userId ||
              active.orgId !== owner.orgId
            ) {
              throw new Error("Account changed. Refresh before signing out.");
            }
            await perform();
          },
        );
      } else {
        throw new Error(
          "Safe sign-out coordination is unavailable in this browser. Close other app tabs before using the existing sign-out endpoint.",
        );
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void signout()}
        className="text-ink-2 hover:bg-surface min-h-12 rounded-xl px-3 text-sm"
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && (
        <p role="alert" className="max-w-xs text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

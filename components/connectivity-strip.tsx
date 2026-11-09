"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useOnline } from "@/lib/offline/use-form-draft";
import { replayQueue } from "@/lib/offline/replay";
import { listQueue, scopeOf, type Owner } from "@/lib/offline/store";

export function ConnectivityStrip({
  owner,
  canWrite,
}: {
  owner: Owner;
  canWrite: boolean;
}) {
  const online = useOnline();
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await listQueue(owner);
      setCount(rows.filter((row) => row.status !== "synced").length);
    } catch {
      setStatus("Local storage unavailable");
    }
  }, [owner]);

  const sync = useCallback(async () => {
    if (!canWrite || !navigator.onLine) return;
    if (!navigator.locks) {
      setStatus("Automatic sync unavailable; review saved entries");
      return;
    }
    try {
      await navigator.locks.request(
        `karigar-sync:${scopeOf(owner)}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) return;
          setStatus("Syncing…");
          const result = await replayQueue(owner);
          setStatus(
            {
              done: null,
              auth: "Sync paused: check the signed-in account",
              review: "Sync paused: an entry needs review",
              waiting: "Sync paused: entries remain saved locally",
            }[result],
          );
        },
      );
      await refresh();
    } catch {
      setStatus("Sync unavailable; entries remain saved locally");
    }
  }, [owner, canWrite, refresh]);

  useEffect(() => {
    let live = true;
    listQueue(owner)
      .then((entries) => {
        if (!live) return;
        setCount(entries.filter((row) => row.status !== "synced").length);
        void sync();
      })
      .catch(() => {
        if (live) setStatus("Local storage unavailable");
      });
    const changed = () => {
      void refresh();
    };
    const reconnected = () => {
      void sync();
    };
    window.addEventListener("karigar-queue-changed", changed);
    window.addEventListener("online", reconnected);
    const timer = window.setInterval(changed, 5000);
    return () => {
      live = false;
      window.removeEventListener("karigar-queue-changed", changed);
      window.removeEventListener("online", reconnected);
      window.clearInterval(timer);
    };
  }, [owner, refresh, sync]);

  return (
    <div className="border-line bg-surface mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
      <p role="status">
        {online ? "Online" : "Offline"} · {count} unsynced on this tablet
        {status ? ` · ${status}` : ""}
      </p>
      {canWrite && (
        <Link href="/sync" className="text-gold-ink underline">
          Review sync
        </Link>
      )}
    </div>
  );
}

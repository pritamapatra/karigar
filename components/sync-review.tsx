"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { replayQueue } from "@/lib/offline/replay";
import {
  discardReview,
  listQueue,
  scopeOf,
  type Owner,
  type QueueEntry,
} from "@/lib/offline/store";

export function SyncReview({ owner }: { owner: Owner }) {
  const [rows, setRows] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const entries = await listQueue(owner);
    setRows(entries);
    setLoading(false);
  }, [owner]);

  useEffect(() => {
    let live = true;
    listQueue(owner)
      .then((entries) => {
        if (!live) return;
        setRows(entries);
        setLoading(false);
      })
      .catch(() => {
        if (!live) return;
        setError("Could not read local storage. Entries have not been sent.");
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [owner]);

  const sync = useCallback(async () => {
    if (!navigator.onLine) {
      setMessage("Offline. Saved entries will remain on this tablet.");
      return;
    }
    if (!navigator.locks) {
      setError(
        "Safe cross-tab sync is unavailable in this browser. Entries have not been sent.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await navigator.locks.request(
        `karigar-sync:${scopeOf(owner)}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) {
            setMessage("Another tab is syncing this account.");
            return;
          }
          const result = await replayQueue(owner);
          setMessage(
            {
              done: "All waiting entries have synced.",
              auth: "Sync paused. Sign in as the account that saved these entries.",
              review:
                "Sync paused. Resolve the first rejected entry before continuing.",
              waiting:
                "Sync paused. Waiting entries are retained for an identical retry.",
            }[result],
          );
        },
      );
      await refresh();
    } catch {
      setError("Could not complete sync. Do not re-enter these transactions.");
    } finally {
      setBusy(false);
    }
  }, [owner, refresh]);

  useEffect(() => {
    const reconnect = () => {
      void sync();
    };
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, [sync]);

  async function discard(row: QueueEntry) {
    if (
      !window.confirm(
        "Discard this rejected local entry? It has not been recorded by the server.",
      )
    )
      return;
    try {
      await discardReview(owner, row.id);
      await refresh();
      setMessage(
        "Rejected entry discarded. Later entries still require server validation.",
      );
    } catch {
      setError("Could not discard the local entry.");
    }
  }

  if (loading)
    return <p role="status">Loading entries saved on this tablet…</p>;

  return (
    <section className="space-y-4" aria-label="Sync review">
      <p className="text-ink-2">
        Entries are local to this account and browser. Waiting entries are not
        confirmed ledger transactions.
      </p>
      <Button type="button" disabled={busy} onClick={() => void sync()}>
        {busy ? "Syncing…" : "Sync waiting entries"}
      </Button>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {!error && rows.length === 0 && <p>No entries saved on this tablet.</p>}
      <ul className="space-y-3">
        {rows.map((row) => (
          <li
            key={row.id}
            className="border-line space-y-2 rounded-xl border p-4"
          >
            <p>
              {row.endpoint === "/api/issues" ? "Issue" : "Receipt"} ·{" "}
              {new Date(row.createdAt).toLocaleString()}
            </p>
            <p>
              Status:{" "}
              {row.status === "review"
                ? "Needs review"
                : row.status === "synced"
                  ? "Synced"
                  : "Waiting"}
            </p>
            {row.reason && <p>{row.reason}</p>}
            {row.status === "review" && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void discard(row)}
              >
                Discard rejected entry
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

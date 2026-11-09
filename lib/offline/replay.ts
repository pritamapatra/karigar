import { listQueue, scopeOf, setQueueStatus, type Owner } from "./store";

type Fetcher = typeof fetch;

export async function replayQueue(owner: Owner, request: Fetcher = fetch) {
  const rows = await listQueue(owner);

  for (const row of rows) {
    if (row.status === "synced") continue;
    // A rejection can invalidate later receipts/balance assumptions.
    if (row.status === "review") return "review" as const;

    try {
      const session = await request("/api/session", { cache: "no-store" });
      if (!session.ok) return "auth" as const;
      const current = (await session.json()) as Owner;
      if (scopeOf(current) !== scopeOf(owner)) return "auth" as const;

      const response = await request(row.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Karigar-User": owner.userId,
          "X-Karigar-Org": owner.orgId,
        },
        body: row.body,
      });

      if (response.status === 401 || response.status === 403) {
        return "auth" as const;
      }
      if (
        response.status >= 500 ||
        response.status === 408 ||
        response.status === 429
      ) {
        return "waiting" as const;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        await setQueueStatus(
          owner,
          row.id,
          "review",
          typeof body?.error === "string"
            ? body.error
            : `Server rejected this entry (${response.status}).`,
        );
        return "review" as const;
      }

      await setQueueStatus(owner, row.id, "synced", null);
    } catch {
      return "waiting" as const;
    }
  }
  return "done" as const;
}

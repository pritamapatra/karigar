import { openDB, type DBSchema } from "idb";

export type Owner = { orgId: string; userId: string };
export type QueueEntry = {
  id: string;
  scope: string;
  endpoint: "/api/issues" | "/api/receipts";
  body: string;
  createdAt: number;
  status: "waiting" | "review" | "synced";
  reason: string | null;
};
type Draft = {
  id: string;
  scope: string;
  value: unknown;
  updatedAt: number;
};

interface OfflineDb extends DBSchema {
  queue: {
    key: string;
    value: QueueEntry;
    indexes: { scope: string };
  };
  drafts: {
    key: string;
    value: Draft;
    indexes: { scope: string };
  };
}

export const scopeOf = (owner: Owner) =>
  JSON.stringify([owner.orgId, owner.userId]);

const database = () =>
  openDB<OfflineDb>("karigar-offline-v1", 1, {
    upgrade(db) {
      db.createObjectStore("queue", { keyPath: "id" }).createIndex(
        "scope",
        "scope",
      );
      db.createObjectStore("drafts", { keyPath: "id" }).createIndex(
        "scope",
        "scope",
      );
    },
  });

export async function saveDraft(owner: Owner, form: string, value: unknown) {
  const db = await database();
  const scope = scopeOf(owner);
  try {
    await db.put("drafts", {
      id: JSON.stringify([scope, form]),
      scope,
      value,
      updatedAt: Date.now(),
    });
  } finally {
    db.close();
  }
}

export async function loadDraft<T>(
  owner: Owner,
  form: string,
): Promise<T | null> {
  const db = await database();
  try {
    const row = await db.get("drafts", JSON.stringify([scopeOf(owner), form]));
    return row ? (row.value as T) : null;
  } finally {
    db.close();
  }
}

export async function removeDraft(owner: Owner, form: string) {
  const db = await database();
  try {
    await db.delete("drafts", JSON.stringify([scopeOf(owner), form]));
  } finally {
    db.close();
  }
}

export async function enqueue(
  owner: Owner,
  endpoint: QueueEntry["endpoint"],
  body: string,
): Promise<QueueEntry> {
  const payload = JSON.parse(body) as { idempotencyKey?: unknown };
  if (
    typeof payload.idempotencyKey !== "string" ||
    payload.idempotencyKey.length < 8
  ) {
    throw new Error("Queued request requires an idempotency key.");
  }
  const scope = scopeOf(owner);
  const id = JSON.stringify([scope, payload.idempotencyKey]);
  const db = await database();
  try {
    const tx = db.transaction("queue", "readwrite");
    const existing = await tx.store.get(id);
    if (existing) {
      await tx.done;
      if (existing.endpoint !== endpoint || existing.body !== body) {
        throw new Error(
          "This request key is already attached to different values.",
        );
      }
      return existing;
    }
    const entry: QueueEntry = {
      id,
      scope,
      endpoint,
      body,
      createdAt: Date.now(),
      status: "waiting",
      reason: null,
    };
    await tx.store.add(entry);
    await tx.done;
    return entry;
  } finally {
    db.close();
  }
}

export async function listQueue(owner: Owner) {
  const db = await database();
  try {
    return (await db.getAllFromIndex("queue", "scope", scopeOf(owner))).sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    );
  } finally {
    db.close();
  }
}

export async function setQueueStatus(
  owner: Owner,
  id: string,
  status: QueueEntry["status"],
  reason: string | null,
) {
  const db = await database();
  try {
    const tx = db.transaction("queue", "readwrite");
    const row = await tx.store.get(id);
    if (row?.scope === scopeOf(owner)) {
      await tx.store.put({ ...row, status, reason });
    }
    await tx.done;
  } finally {
    db.close();
  }
}

export async function discardReview(owner: Owner, id: string) {
  const db = await database();
  try {
    const tx = db.transaction("queue", "readwrite");
    const row = await tx.store.get(id);
    if (row?.scope !== scopeOf(owner) || row.status !== "review") {
      await tx.done;
      throw new Error(
        "Only rejected entries belonging to this account can be discarded.",
      );
    }
    await tx.store.delete(id);
    await tx.done;
  } finally {
    db.close();
  }
}

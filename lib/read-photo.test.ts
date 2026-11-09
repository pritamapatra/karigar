import { describe, expect, test, vi } from "vitest";
import { READ_LIMIT_PER_MINUTE, readPhoto } from "./read-photo";

const ORG = "org-1";
const input = { orgId: ORG, userId: "u1", photoId: "p1" };
const good = JSON.stringify({
  kind: "scale",
  weight_g: 112.45,
  purity_pct: 91.6,
  confidence: "high",
  notes: null,
});

function setup(over: { path?: string; recent?: number } = {}) {
  const create = vi
    .fn()
    .mockImplementation(async ({ data }) => ({ id: "r1", ...data }));
  const download = vi.fn().mockResolvedValue({
    data: new Blob([new Uint8Array([1, 2, 3])]),
    error: null,
  });
  const db = {
    scalePhoto: {
      findUnique: vi.fn().mockResolvedValue({
        id: "p1",
        storagePath: over.path ?? `${ORG}/p1.png`,
      }),
    },
    aiReading: {
      count: vi.fn().mockResolvedValue(over.recent ?? 0),
      create,
    },
  };
  const storage = { storage: { from: vi.fn().mockReturnValue({ download }) } };
  return { db: db as never, storage: storage as never, create, download };
}

describe("readPhoto", () => {
  test("saves a successful read as a pending reading in integer units", async () => {
    const { db, storage, create } = setup();
    const result = await readPhoto(db, storage, input, {
      call: async () => good,
    });
    expect(result.ok).toBe(true);
    expect(create.mock.calls[0][0].data).toMatchObject({
      photoId: "p1",
      kind: "scale",
      weightMg: 112450,
      purityH: 9160,
      confidence: "high",
      status: "pending",
    });
  });

  test("saves a failed read as rejected with the reason", async () => {
    const { db, storage, create } = setup();
    const result = await readPhoto(db, storage, input, {
      call: async () => "not json",
    });
    expect(result).toMatchObject({ ok: false, reason: "malformed" });
    expect(create.mock.calls[0][0].data).toMatchObject({
      confidence: "unreadable",
      status: "rejected",
      rawResponse: { error: "malformed" },
    });
  });

  test("hides photos that belong to another organization", async () => {
    const { db, storage, download } = setup({ path: "org-2/p1.png" });
    const call = vi.fn();
    await expect(
      readPhoto(db, storage, input, { call }),
    ).rejects.toMatchObject({ status: 404 });
    expect(download).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });

  test("returns 429 without calling the provider over the limit", async () => {
    const { db, storage } = setup({ recent: READ_LIMIT_PER_MINUTE });
    const call = vi.fn();
    await expect(
      readPhoto(db, storage, input, { call }),
    ).rejects.toMatchObject({ status: 429 });
    expect(call).not.toHaveBeenCalled();
  });
});

import "fake-indexeddb/auto";
import { randomUUID } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { readReference } from "./reference";
import { saveDraft } from "./store";

afterEach(() => vi.unstubAllGlobals());

const owner = () => ({ orgId: randomUUID(), userId: randomUUID() });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("successful reference reads are available during later network failure", async () => {
  const account = owner();
  const cached = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(json({ categories: [{ id: "c1" }] }))
      .mockRejectedValueOnce(new TypeError("offline")),
  );
  await readReference(account, "/api/categories");
  expect(await readReference(account, "/api/categories", {}, cached)).toEqual({
    categories: [{ id: "c1" }],
  });
  expect(cached).toHaveBeenCalledWith(expect.any(Number));
});

test("reference fallback is isolated by account", async () => {
  const account = owner();
  await saveDraft(account, "reference:/api/jobs", {
    data: { jobs: [{ id: "j1" }] },
    savedAt: 1,
  });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  await expect(
    readReference({ ...account, userId: randomUUID() }, "/api/jobs"),
  ).rejects.toThrow("offline");
});

test.each([401, 403, 404, 500])(
  "does not mask HTTP %s with cached data",
  async (status) => {
    const account = owner();
    await saveDraft(account, "reference:/api/jobs", {
      data: { jobs: [{ id: "j1" }] },
      savedAt: 1,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, status)));
    await expect(readReference(account, "/api/jobs")).rejects.toThrow(
      String(status),
    );
  },
);

test("aborted requests do not restore stale reference data", async () => {
  const account = owner();
  await saveDraft(account, "reference:/api/jobs", {
    data: { jobs: [] },
    savedAt: 1,
  });
  const controller = new AbortController();
  controller.abort();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("aborted")));
  await expect(
    readReference(account, "/api/jobs", {
      signal: controller.signal,
    }),
  ).rejects.toThrow("aborted");
});

import "fake-indexeddb/auto";
import { randomUUID } from "node:crypto";
import { expect, test, vi } from "vitest";
import {
  enqueue,
  listQueue,
  saveDraft,
  loadDraft,
  discardReview,
  setQueueStatus,
} from "./store";
import { replayQueue } from "./replay";
import { assertRequestOwner } from "./request-owner";

const owner = () => ({ orgId: randomUUID(), userId: randomUUID() });
const body = () =>
  JSON.stringify({ idempotencyKey: randomUUID(), grossMg: 53000 });
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("drafts survive reads and are isolated by account", async () => {
  const a = owner();
  const b = { ...a, userId: randomUUID() };
  await saveDraft(a, "issue", { gross: "53.000" });
  expect(await loadDraft(a, "issue")).toEqual({ gross: "53.000" });
  expect(await loadDraft(b, "issue")).toBeNull();
});

test("queue deduplicates identical payloads and rejects changed values under the same key", async () => {
  const a = owner();
  const payload = body();
  await enqueue(a, "/api/issues", payload);
  await enqueue(a, "/api/issues", payload);
  expect(await listQueue(a)).toHaveLength(1);
  await expect(
    enqueue(a, "/api/issues", payload.replace("53000", "54000")),
  ).rejects.toThrow("different values");
});

test("another account cannot list queued requests", async () => {
  const a = owner();
  await enqueue(a, "/api/issues", body());
  expect(await listQueue({ ...a, userId: randomUUID() })).toEqual([]);
});

test("successful replay sends exact bytes and does not resend synced entries", async () => {
  const a = owner();
  const payload = body();
  await enqueue(a, "/api/issues", payload);
  const request = vi
    .fn()
    .mockResolvedValueOnce(json(a))
    .mockResolvedValueOnce(json({ entry: {} }));
  expect(await replayQueue(a, request)).toBe("done");
  expect(request.mock.calls[1][1].body).toBe(payload);
  expect((await listQueue(a))[0].status).toBe("synced");
  request.mockClear();
  expect(await replayQueue(a, request)).toBe("done");
  expect(request).not.toHaveBeenCalled();
});

test("account switch prevents posting", async () => {
  const a = owner();
  await enqueue(a, "/api/issues", body());
  const request = vi.fn().mockResolvedValue(json(owner()));
  expect(await replayQueue(a, request)).toBe("auth");
  expect(request).toHaveBeenCalledTimes(1);
  expect((await listQueue(a))[0].status).toBe("waiting");
});

test("network failure preserves exact waiting request", async () => {
  const a = owner();
  const payload = body();
  await enqueue(a, "/api/issues", payload);
  const request = vi
    .fn()
    .mockResolvedValueOnce(json(a))
    .mockRejectedValueOnce(new TypeError("offline"));
  expect(await replayQueue(a, request)).toBe("waiting");
  expect((await listQueue(a))[0]).toMatchObject({
    body: payload,
    status: "waiting",
  });
});

test("server rejection becomes review and blocks later replay", async () => {
  const a = owner();
  const first = await enqueue(a, "/api/issues", body());
  const request = vi
    .fn()
    .mockResolvedValueOnce(json(a))
    .mockResolvedValueOnce(json({ error: "Duplicate job number" }, 409));
  expect(await replayQueue(a, request)).toBe("review");
  expect((await listQueue(a))[0]).toMatchObject({
    status: "review",
    reason: "Duplicate job number",
  });
  request.mockClear();
  expect(await replayQueue(a, request)).toBe("review");
  expect(request).not.toHaveBeenCalled();
  await discardReview(a, first.id);
  expect(await listQueue(a)).toEqual([]);
});

test("unknown-result requests cannot be discarded as rejected", async () => {
  const a = owner();
  const row = await enqueue(a, "/api/issues", body());
  await expect(discardReview(a, row.id)).rejects.toThrow("Only rejected");
});

test("another account cannot alter queue status", async () => {
  const a = owner();
  const row = await enqueue(a, "/api/issues", body());
  await setQueueStatus(owner(), row.id, "synced", null);
  expect((await listQueue(a))[0].status).toBe("waiting");
});

test("write route owner guard rejects switched sessions", () => {
  const a = owner();
  const request = new Request("https://example.test/api/issues", {
    headers: { "X-Karigar-User": "other", "X-Karigar-Org": a.orgId },
  });
  expect(() => assertRequestOwner(request, a)).toThrow("Account changed");
  expect(() =>
    assertRequestOwner(new Request("https://example.test"), a),
  ).not.toThrow();
});

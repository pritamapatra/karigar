import { beforeEach, describe, expect, test, vi } from "vitest";
import { issueGold } from "./issue";

const input = {
  orgId: "org-a",
  userId: "user-a",
  karigarId: "karigar-a",
  categoryId: "category-a",
  jobNumber: "JOB-A",
  grossMg: 53000,
  purityH: 9160,
  idempotencyKey: "request-key-a",
};

function setup() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([{ n: 30410 }]),
    karigar: { findFirst: vi.fn().mockResolvedValue({ active: true }) },
    itemCategory: {
      findFirst: vi.fn().mockResolvedValue({ id: input.categoryId }),
    },
    job: {
      create: vi.fn().mockResolvedValue({ id: "job-a", jobNumber: "JOB-A" }),
    },
    ledgerEntry: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      aggregate: vi.fn().mockResolvedValue({ _sum: { fineMg: 48548 } }),
      create: vi
        .fn()
        .mockImplementation(async ({ data }) => ({ id: "entry-a", ...data })),
    },
    scalePhoto: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: "photo-a", storagePath: "org-a/photo-a.jpg" }),
    },
    aiReading: {
      findUnique: vi.fn().mockResolvedValue({
        id: "reading-a",
        photoId: "photo-a",
        confidence: "high",
        weightMg: 53000,
        purityH: 9160,
        status: "pending",
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const db = {
    $transaction: vi.fn().mockImplementation(async (fn) => fn(tx)),
  };
  return { tx, db: db as unknown as Parameters<typeof issueGold>[0] };
}

beforeEach(() => vi.clearAllMocks());

describe("issue photo and replay boundaries", () => {
  test("persists matching photo and reading references", async () => {
    const { tx, db } = setup();
    const result = await issueGold(db, {
      ...input,
      photoId: "photo-a",
      aiReadingId: "reading-a",
    });
    expect(result.entry.fineMg).toBe(48548);
    expect(tx.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        photoId: "photo-a",
        aiReadingId: "reading-a",
        fineMg: 48548,
      }),
    });
    expect(tx.aiReading.updateMany).toHaveBeenCalledWith({
      where: { id: "reading-a", status: "pending" },
      data: { status: "confirmed", confirmedBy: "user-a" },
    });
  });

  test("blocks mismatch before creating the job", async () => {
    const { tx, db } = setup();
    await expect(
      issueGold(db, {
        ...input,
        grossMg: 54000,
        photoId: "photo-a",
        aiReadingId: "reading-a",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(tx.job.create).not.toHaveBeenCalled();
  });

  test("records a mismatch override", async () => {
    const { tx, db } = setup();
    await issueGold(db, {
      ...input,
      grossMg: 54000,
      photoId: "photo-a",
      aiReadingId: "reading-a",
      overrideReason: "Checked display manually",
    });
    expect(tx.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reason: "Checked display manually" }),
    });
    expect(tx.aiReading.updateMany).toHaveBeenCalledWith({
      where: { id: "reading-a", status: "pending" },
      data: { status: "overridden", confirmedBy: "user-a" },
    });
  });

  test("rejects a photo belonging to another organisation", async () => {
    const { tx, db } = setup();
    tx.scalePhoto.findUnique.mockResolvedValue({
      id: "photo-a",
      storagePath: "org-b/photo-a.jpg",
    });
    await expect(
      issueGold(db, {
        ...input,
        photoId: "photo-a",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(tx.job.create).not.toHaveBeenCalled();
  });

  test("rejects a reading attached to a different photo", async () => {
    const { tx, db } = setup();
    tx.aiReading.findUnique.mockResolvedValue({
      id: "reading-a",
      photoId: "other-photo",
      confidence: "high",
      weightMg: 53000,
      purityH: 9160,
      status: "pending",
    });
    await expect(
      issueGold(db, {
        ...input,
        photoId: "photo-a",
        aiReadingId: "reading-a",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("requires a photo for an AI reference", async () => {
    const { db } = setup();
    await expect(
      issueGold(db, {
        ...input,
        aiReadingId: "reading-a",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  test("replays an identical request without creating another job", async () => {
    const { tx, db } = setup();
    tx.ledgerEntry.findUnique.mockResolvedValue({
      ...input,
      id: "entry-a",
      entryType: "issue",
      createdBy: input.userId,
      photoId: null,
      aiReadingId: null,
      reason: null,
      fineMg: 48548,
      slipNo: "TX-30411",
      job: { jobNumber: input.jobNumber, categoryId: input.categoryId },
    });
    const result = await issueGold(db, input);
    expect(result.replayed).toBe(true);
    expect(tx.job.create).not.toHaveBeenCalled();
  });

  test.each([
    { orgId: "org-b" },
    { createdBy: "user-b" },
    { grossMg: 54000 },
    { entryType: "receipt_scrap" },
    { photoId: "another-photo" },
  ])("rejects conflicting replay: %j", async (changes) => {
    const { tx, db } = setup();
    tx.ledgerEntry.findUnique.mockResolvedValue({
      ...input,
      id: "entry-a",
      entryType: "issue",
      createdBy: input.userId,
      photoId: null,
      aiReadingId: null,
      reason: null,
      fineMg: 48548,
      slipNo: "TX-30411",
      job: { jobNumber: input.jobNumber, categoryId: input.categoryId },
      ...changes,
    });
    await expect(issueGold(db, input)).rejects.toMatchObject({ status: 409 });
    expect(tx.job.create).not.toHaveBeenCalled();
  });
});

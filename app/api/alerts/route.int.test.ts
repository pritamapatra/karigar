import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { createDb } from "@/lib/db";
import { GET } from "./route";
import { POST } from "./[id]/review/route";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getPrisma: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/prisma", () => ({ getPrisma: mocks.getPrisma }));

const db = createDb(process.env.DIRECT_URL);
const fixtures: {
  orgId: string;
  karigarId: string;
  jobId: string;
  alertId: string;
}[] = [];

beforeAll(async () => {
  for (let index = 0; index < 2; index++) {
    const suffix = randomUUID().slice(0, 8);
    const org = await db.organization.create({
      data: { name: `it-alert-api-${suffix}` },
    });
    const karigar = await db.karigar.create({
      data: {
        orgId: org.id,
        name: `API Karigar ${suffix}`,
        code: `A-${suffix}`,
      },
    });
    const category = await db.itemCategory.create({
      data: { orgId: org.id, name: "API test category" },
    });
    const job = await db.job.create({
      data: {
        orgId: org.id,
        karigarId: karigar.id,
        categoryId: category.id,
        jobNumber: `API-${suffix}`,
        issuedFineMg: 100000,
        status: "closed",
        closedAt: new Date(),
        closedAllowedMg: 3000,
        closedActualMg: 4500,
      },
    });
    const alert = await db.alert.create({
      data: {
        orgId: org.id,
        karigarId: karigar.id,
        jobId: job.id,
        kind: "drift",
        baselineBp: 100,
        actualBp: 150,
        message: "Review: loss is above this karigar's usual range",
      },
    });
    fixtures.push({
      orgId: org.id,
      karigarId: karigar.id,
      jobId: job.id,
      alertId: alert.id,
    });
  }
}, 60000);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireRole.mockResolvedValue({
    orgId: fixtures[0].orgId,
    role: "finance",
  });
  mocks.getPrisma.mockReturnValue(db);
});

afterAll(async () => {
  await db.$disconnect();
});

function review(id: string) {
  return POST(
    new Request(`http://localhost/api/alerts/${id}/review`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("alerts API database boundaries", () => {
  test("GET returns only the authenticated organization's alerts", async () => {
    const own = fixtures[0];
    const other = fixtures[1];
    const response = await GET(
      new Request(`http://localhost/api/alerts?orgId=${other.orgId}`),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0]).toMatchObject({
      id: own.alertId,
      karigar: { id: own.karigarId },
      job: { id: own.jobId },
    });
    expect(
      body.alerts.some((alert: { id: string }) => alert.id === other.alertId),
    ).toBe(false);
  });

  test("review persists status and replay preserves all other fields", async () => {
    const own = fixtures[0];
    const before = await db.alert.findUniqueOrThrow({
      where: { id: own.alertId },
    });

    const first = await review(own.alertId);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      id: own.alertId,
      status: "reviewed",
    });

    const afterFirst = await db.alert.findUniqueOrThrow({
      where: { id: own.alertId },
    });
    expect(afterFirst).toEqual({ ...before, status: "reviewed" });

    const second = await review(own.alertId);
    expect(second.status).toBe(200);
    expect(
      await db.alert.findUniqueOrThrow({
        where: { id: own.alertId },
      }),
    ).toEqual(afterFirst);
  });

  test("another organization's alert returns 404 and remains unchanged", async () => {
    const other = fixtures[1];
    const before = await db.alert.findUniqueOrThrow({
      where: { id: other.alertId },
    });

    const response = await review(other.alertId);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Alert not found" });
    expect(
      await db.alert.findUniqueOrThrow({
        where: { id: other.alertId },
      }),
    ).toEqual(before);
  });

  test("an unknown alert returns the same 404 response", async () => {
    const response = await review(randomUUID());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Alert not found" });
  });
});

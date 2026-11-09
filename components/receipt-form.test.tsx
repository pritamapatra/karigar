// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ReceiptForm } from "./receipt-form";

vi.mock("sonner", () => ({
  toast: { success: vi.fn() },
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    items,
  }: {
    value: string | null;
    onValueChange: (value: string) => void;
    items: { value: string; label: string }[];
  }) => (
    <select
      aria-label="Open job"
      value={value ?? ""}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="">Select a job</option>
      {items.map((item) => (
        <option key={item.value} value={item.value}>{item.label}</option>
      ))}
    </select>
  ),
  SelectContent: () => null,
  SelectItem: () => null,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

vi.mock("@/components/scale-photo-reader", () => ({
  ScalePhotoReader: ({
    onChange,
    onBusyChange,
  }: {
    onChange: (value: unknown) => void;
    onBusyChange: (busy: boolean) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => onChange({
          photoId: "p1",
          aiReadingId: "r1",
          reading: {
            kind: "scale",
            confidence: "high",
            weight: { value: 53000, state: "ok" },
            purity: { value: null, state: "cant_read" },
            notes: null,
          },
        })}
      >
        Attach test photo
      </button>
      <button type="button" onClick={() => onBusyChange(true)}>
        Start test upload
      </button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setup() {
  const fetchMock = vi.fn().mockResolvedValueOnce(json({
    jobs: [{
      id: "j1",
      jobNumber: "JOB-1",
      karigar: { id: "k1", name: "Test Karigar", code: "K1" },
      category: { id: "c1", name: "Ring" },
      issuedFineMg: 200000,
      balanceMg: 200000,
      wastageBp: 100,
      allowedMg: 2000,
    }],
  }));
  vi.stubGlobal("fetch", fetchMock);
  render(<ReceiptForm />);
  return fetchMock;
}

async function fill(weight = "53.00") {
  const user = userEvent.setup();
  await user.selectOptions(await screen.findByLabelText("Open job"), "j1");
  await user.click(screen.getByRole("button", { name: /^Scrap$/ }));
  await user.type(screen.getByLabelText("Gross weight (g)"), weight);
  await user.type(screen.getByLabelText("Purity (%)"), "91.60");
  await user.click(screen.getByRole("button", { name: "Attach test photo" }));
  return user;
}

const saved = {
  entry: { slipNo: "TX-30411", jobId: "j1" },
  jobBalanceMg: 151452,
};

test("submits photo and AI references with matching manual values", async () => {
  const fetchMock = setup();
  fetchMock.mockResolvedValueOnce(json(saved));
  const user = await fill();
  await user.click(screen.getByRole("button", { name: "Record receipt" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const body = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(body).toMatchObject({
    jobId: "j1",
    entryType: "receipt_scrap",
    grossMg: 53000,
    purityH: 9160,
    photoId: "p1",
    aiReadingId: "r1",
  });
  expect(body.overrideReason).toBeUndefined();
  await waitFor(() => {
    expect(screen.getByLabelText("Gross weight (g)")).toHaveValue("");
  });
});

test("a mismatch requires an override reason and submits it", async () => {
  const fetchMock = setup();
  fetchMock.mockResolvedValueOnce(json(saved));
  const user = await fill("54.00");
  const save = screen.getByRole("button", { name: "Record receipt" });
  expect(save).toBeDisabled();

  await user.type(
    screen.getByLabelText("Override reason"),
    "Checked display manually",
  );
  expect(save).toBeEnabled();
  await user.click(save);

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
    grossMg: 54000,
    overrideReason: "Checked display manually",
  });
});

test("an uncertain save locks fields and retries the identical payload", async () => {
  const fetchMock = setup();
  fetchMock
    .mockResolvedValueOnce(json({ error: "Temporary failure" }, 500))
    .mockResolvedValueOnce(json(saved));
  const user = await fill();
  await user.click(screen.getByRole("button", { name: "Record receipt" }));

  const retry = await screen.findByRole("button", { name: "Retry receipt" });
  expect(screen.getByLabelText("Gross weight (g)")).toBeDisabled();
  await user.click(retry);

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(fetchMock.mock.calls[2][1].body).toBe(fetchMock.mock.calls[1][1].body);
  await waitFor(() => {
    expect(screen.getByLabelText("Gross weight (g)")).toBeEnabled();
  });
});

test("photo processing blocks receipt saving and job closure", async () => {
  setup();
  const user = await fill();
  await user.click(screen.getByRole("button", { name: "Start test upload" }));

  expect(screen.getByRole("button", { name: "Record receipt" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Close job for review" }),
  ).toBeDisabled();
});

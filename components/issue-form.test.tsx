// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { IssueForm } from "./issue-form";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/slip-dialog", () => ({
  SlipDialog: () => null,
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
      aria-label={
        items.some((item) => item.value === "k1") ? "Karigar" : "Item category"
      }
      value={value ?? ""}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="">Choose</option>
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  ),
  SelectContent: () => null,
  SelectItem: () => null,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

const reading = {
  kind: "scale" as const,
  confidence: "high" as const,
  weight: { value: 53000, state: "ok" as const },
  purity: { value: 9160, state: "ok" as const },
  notes: null,
};

vi.mock("@/components/scale-photo-reader", () => ({
  ScalePhotoReader: ({
    disabled,
    onChange,
    onBusyChange,
    onUseReading,
  }: {
    disabled?: boolean;
    onChange: (value: unknown) => void;
    onBusyChange: (value: boolean) => void;
    onUseReading: (value: unknown) => void;
  }) => (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onChange({
            photoId: "p1",
            aiReadingId: "r1",
            reading,
          })
        }
      >
        Attach test photo
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onUseReading(reading)}
      >
        Use test reading
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onBusyChange(true)}
      >
        Start test upload
      </button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setup() {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      json({
        karigars: [
          {
            id: "k1",
            name: "Test Karigar",
            code: "K1",
            active: true,
            balanceMg: 0,
          },
        ],
      }),
    )
    .mockResolvedValueOnce(
      json({
        categories: [{ id: "c1", name: "Ring" }],
      }),
    );
  vi.stubGlobal("fetch", fetchMock);
  render(<IssueForm />);
  return fetchMock;
}

async function fill(weight = "53.000") {
  const user = userEvent.setup();
  await user.selectOptions(await screen.findByLabelText("Karigar"), "k1");
  await user.selectOptions(screen.getByLabelText("Item category"), "c1");
  await user.type(screen.getByLabelText("Job number"), "JOB-1");
  await user.type(screen.getByLabelText("Gross weight (g)"), weight);
  await user.type(screen.getByLabelText("Purity (%)"), "91.60");
  await user.click(screen.getByRole("button", { name: "Attach test photo" }));
  return user;
}

const saved = {
  entry: {
    slipNo: "TX-30411",
    jobNumber: "JOB-1",
    grossMg: 53000,
    purityH: 9160,
    fineMg: 48548,
  },
  balanceMg: 48548,
};

test("submits matching photo and AI references and clears saved inputs", async () => {
  const fetchMock = setup();
  fetchMock.mockResolvedValueOnce(json(saved));
  const user = await fill();
  await user.click(screen.getByRole("button", { name: "Issue gold" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({
    karigarId: "k1",
    categoryId: "c1",
    jobNumber: "JOB-1",
    grossMg: 53000,
    purityH: 9160,
    photoId: "p1",
    aiReadingId: "r1",
  });
  await waitFor(() => {
    expect(screen.getByLabelText("Gross weight (g)")).toHaveValue("");
  });
});

test("mismatch requires a nonblank override", async () => {
  const fetchMock = setup();
  fetchMock.mockResolvedValueOnce(json(saved));
  const user = await fill("54.000");
  const save = screen.getByRole("button", { name: "Issue gold" });
  expect(save).toBeDisabled();
  await user.type(screen.getByLabelText("Override reason"), "   ");
  expect(save).toBeDisabled();
  await user.type(screen.getByLabelText("Override reason"), "Checked display");
  expect(save).toBeEnabled();
  await user.click(save);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({
    grossMg: 54000,
    overrideReason: "Checked display",
  });
});

test("uncertain saves lock fields and retry the identical serialized payload", async () => {
  const fetchMock = setup();
  fetchMock
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce(json(saved));
  const user = await fill();
  await user.click(screen.getByRole("button", { name: "Issue gold" }));
  const retry = await screen.findByRole("button", { name: "Retry issue" });
  expect(screen.getByLabelText("Job number")).toBeDisabled();
  expect(screen.getByLabelText("Gross weight (g)")).toBeDisabled();
  await user.click(retry);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  expect(fetchMock.mock.calls[3][1].body).toBe(fetchMock.mock.calls[2][1].body);
  await waitFor(() => {
    expect(screen.getByLabelText("Job number")).toBeEnabled();
  });
});

test("server rejection unlocks fields and shows the actual reason", async () => {
  const fetchMock = setup();
  fetchMock.mockResolvedValueOnce(
    json({ error: "Job number already exists" }, 409),
  );
  const user = await fill();
  await user.click(screen.getByRole("button", { name: "Issue gold" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Job number already exists",
  );
  expect(screen.getByLabelText("Job number")).toBeEnabled();
  expect(screen.getByRole("button", { name: "Issue gold" })).toBeEnabled();
});

test("photo processing blocks issue saving", async () => {
  setup();
  const user = await fill();
  await user.click(screen.getByRole("button", { name: "Start test upload" }));
  expect(screen.getByRole("button", { name: "Issue gold" })).toBeDisabled();
});

test("suggestions only change form values after explicit use", async () => {
  setup();
  const user = await fill("54.000");
  expect(screen.getByLabelText("Gross weight (g)")).toHaveValue("54.000");
  await user.click(screen.getByRole("button", { name: "Use test reading" }));
  expect(screen.getByLabelText("Gross weight (g)")).toHaveValue("53.000");
  expect(screen.getByLabelText("Purity (%)")).toHaveValue("91.60");
  expect(screen.getByRole("button", { name: "Issue gold" })).toBeEnabled();
});

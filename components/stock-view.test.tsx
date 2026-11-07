// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { formatGrams } from "@/lib/gold";
import { StockView } from "./stock-view";

const initialDate = "2026-11-06";

const stock = {
  asOn: initialDate,
  timezone: "Asia/Kolkata",
  openingVaultMg: 500000,
  inHouseStockMg: 460000,
  karigarStockMg: 30000,
  closedWastageMg: 10000,
  totalStockMg: 490000,
  karigars: [
    {
      id: "karigar-1",
      name: "Test Karigar",
      code: "K-TEST",
      stockMg: 30000,
    },
  ],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("shows a loading state while stock is pending", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );

  render(<StockView initialDate={initialDate} />);

  expect(screen.getByLabelText("Loading stock")).toHaveAttribute(
    "aria-busy",
    "true",
  );
});

test("requests the selected date and renders stock cards and karigars", async () => {
  const fetchMock = vi.fn().mockResolvedValue(json(stock));
  vi.stubGlobal("fetch", fetchMock);

  render(<StockView initialDate={initialDate} />);

  const inHouse = await screen.findByRole("region", {
    name: "In-house stock",
  });
  expect(within(inHouse).getByText(formatGrams(460000))).toBeInTheDocument();

  const held = screen.getByRole("region", { name: "With karigars" });
  expect(within(held).getByText(formatGrams(30000))).toBeInTheDocument();

  const total = screen.getByRole("region", { name: "Total stock" });
  expect(within(total).getByText(formatGrams(490000))).toBeInTheDocument();

  const wastage = screen.getByRole("region", {
    name: "Closed-job wastage",
  });
  expect(within(wastage).getByText(formatGrams(10000))).toBeInTheDocument();

  const table = screen.getByRole("table");
  expect(within(table).getByText("Test Karigar")).toBeInTheDocument();
  expect(within(table).getByText("K-TEST")).toBeInTheDocument();
  expect(within(table).getByText(formatGrams(30000))).toBeInTheDocument();

  const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
  expect(url.pathname).toBe("/api/stock");
  expect(url.searchParams.get("asOn")).toBe(initialDate);
  expect(fetchMock.mock.calls[0][1]).toMatchObject({
    cache: "no-store",
    signal: expect.any(AbortSignal),
  });
});

test("shows an empty karigar state without hiding stock totals", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(json({ ...stock, karigars: [] })),
  );

  render(<StockView initialDate={initialDate} />);

  expect(
    await screen.findByText("No karigars on or before this date."),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Total stock" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test("shows an API error and retries successfully", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      json({ error: "Stock temporarily unavailable" }, 503),
    )
    .mockResolvedValueOnce(json(stock));

  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();

  render(<StockView initialDate={initialDate} />);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Stock temporarily unavailable",
  );

  await user.click(screen.getByRole("button", { name: "Try again" }));

  expect(
    await screen.findByRole("region", { name: "Total stock" }),
  ).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("shows a fallback message for a non-JSON error response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 })),
  );

  render(<StockView initialDate={initialDate} />);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not load stock.",
  );
});

test("changing the date requests a new report and aborts the old request", async () => {
  const fetchMock = vi.fn().mockImplementation(async (input: string) => {
    const url = new URL(String(input), "http://localhost");
    return json({ ...stock, asOn: url.searchParams.get("asOn") });
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<StockView initialDate={initialDate} />);

  await screen.findByRole("region", { name: "Total stock" });

  const firstSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;

  fireEvent.change(screen.getByLabelText("As on (IST)"), {
    target: { value: "2026-11-05" },
  });

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  const url = new URL(String(fetchMock.mock.calls[1][0]), "http://localhost");
  expect(url.searchParams.get("asOn")).toBe("2026-11-05");
  expect(firstSignal.aborted).toBe(true);

  expect(await screen.findByText(/As on 2026-11-05/)).toBeInTheDocument();
});

test("clearing the date shows guidance without another stock request", async () => {
  const fetchMock = vi.fn().mockResolvedValue(json(stock));
  vi.stubGlobal("fetch", fetchMock);

  render(<StockView initialDate={initialDate} />);

  await screen.findByRole("region", { name: "Total stock" });

  fireEvent.change(screen.getByLabelText("As on (IST)"), {
    target: { value: "" },
  });

  expect(screen.getByText("Choose a valid as-on date.")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Total stock" })).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

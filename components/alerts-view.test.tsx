// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { AlertsView } from "./alerts-view";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("All statuses omits the status query parameter", async () => {
  const fetchMock = vi.fn().mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          alerts: [],
          page: 1,
          pageSize: 25,
          total: 0,
          canReview: false,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();

  render(<AlertsView />);

  await screen.findByText("Nothing to review");

  const initialUrl = new URL(
    String(fetchMock.mock.calls[0][0]),
    "http://localhost",
  );
  expect(initialUrl.searchParams.get("status")).toBe("new");

  await user.selectOptions(screen.getByLabelText("Status"), "all");

  await screen.findByText("No alerts match these filters.");

  await waitFor(() => {
    const calls = fetchMock.mock.calls;
    const url = new URL(String(calls[calls.length - 1][0]), "http://localhost");

    expect(url.pathname).toBe("/api/alerts");
    expect(url.searchParams.has("status")).toBe(false);
    expect(url.searchParams.has("kind")).toBe(false);
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("pageSize")).toBe("25");
  });
});

test("changing status from page 2 resets the request to page 1", async () => {
  const fetchMock = vi.fn().mockImplementation(async (input: string) => {
    const url = new URL(String(input), "http://localhost");

    return new Response(
      JSON.stringify({
        alerts: [],
        page: Number(url.searchParams.get("page")),
        pageSize: 25,
        total: 26,
        canReview: false,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();

  render(<AlertsView />);

  await screen.findByText("Page 1 of 2");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Page 2 of 2");

  const pageTwoCalls = fetchMock.mock.calls;
  const pageTwoUrl = new URL(
    String(pageTwoCalls[pageTwoCalls.length - 1][0]),
    "http://localhost",
  );
  expect(pageTwoUrl.searchParams.get("page")).toBe("2");

  await user.selectOptions(screen.getByLabelText("Status"), "reviewed");
  await screen.findByText("Page 1 of 2");

  const calls = fetchMock.mock.calls;
  const resetUrl = new URL(
    String(calls[calls.length - 1][0]),
    "http://localhost",
  );
  expect(resetUrl.searchParams.get("status")).toBe("reviewed");
  expect(resetUrl.searchParams.get("page")).toBe("1");
});

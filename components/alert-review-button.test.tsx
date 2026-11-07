// @vitest-environment jsdom

import React, { useState } from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { AlertReviewButton } from "./alert-review-button";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("network failure keeps the lock and allows retrying the same alert", async () => {
  const alertId = "test-alert";
  const onSuccess = vi.fn();
  const onLockChange = vi.fn();
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id: alertId, status: "reviewed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  vi.stubGlobal("fetch", fetchMock);

  function Harness() {
    const [locked, setLocked] = useState(false);

    return (
      <>
        <button disabled={locked}>Other review action</button>
        <AlertReviewButton
          alertId={alertId}
          disabled={locked}
          onLockChange={(value) => {
            onLockChange(value);
            setLocked(value);
          }}
          onSuccess={onSuccess}
        />
      </>
    );
  }

  const user = userEvent.setup();
  render(<Harness />);

  await user.click(
    screen.getByRole("button", { name: "Mark this alert reviewed" }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "We could not confirm whether this alert was marked reviewed.",
  );
  expect(onSuccess).not.toHaveBeenCalled();
  expect(onLockChange.mock.calls).toEqual([[true]]);
  expect(
    screen.getByRole("button", { name: "Other review action" }),
  ).toBeDisabled();

  const retry = screen.getByRole("button", {
    name: "Retry marking this alert reviewed",
  });
  expect(retry).toBeEnabled();
  await user.click(retry);

  await waitFor(() => {
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Other review action" }),
    ).toBeEnabled();
  });

  expect(onLockChange.mock.calls).toEqual([[true], [true], [false]]);
  expect(fetchMock).toHaveBeenCalledTimes(2);

  for (const call of fetchMock.mock.calls) {
    expect(call).toEqual([
      "/api/alerts/test-alert/review",
      { method: "POST", cache: "no-store" },
    ]);
  }
});

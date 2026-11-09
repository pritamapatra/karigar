// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { AiPhotoSheet } from "./ai-photo-sheet";
import type { AiReading } from "@/lib/ai-reading";

afterEach(cleanup);

const reading: AiReading = {
  kind: "scale",
  confidence: "high",
  weight: { value: 53000, state: "ok" },
  purity: { value: 9160, state: "ok" },
  notes: null,
};

function setup(
  overrides: Partial<React.ComponentProps<typeof AiPhotoSheet>> = {},
) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    previewUrl: "blob:test-photo",
    reading,
    busy: false,
    message: null,
    error: null,
    typedWeight: 53000,
    typedPurity: 9160,
    onUseReading: vi.fn(),
    ...overrides,
  };
  render(<AiPhotoSheet {...props} />);
  return props;
}

test("shows evidence, matching values, and copies only after explicit confirmation", async () => {
  const props = setup();
  expect(screen.getByRole("img")).toHaveAttribute("src", "blob:test-photo");
  expect(screen.getAllByText("Matches")).toHaveLength(2);
  expect(props.onUseReading).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Use reading" }));
  expect(props.onUseReading).toHaveBeenCalledWith(reading);
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

test("shows mismatch and supports zoom", async () => {
  setup({ typedWeight: 54000 });
  expect(screen.getByText(/These two values differ/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Zoom photo" }));
  expect(screen.getByRole("button", { name: "Fit photo" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("low confidence offers manual entry without copying suggestions", async () => {
  const props = setup({
    reading: {
      ...reading,
      confidence: "low",
      weight: { value: 53000, state: "needs_review" },
      purity: { value: null, state: "cant_read" },
    },
  });
  expect(screen.getByRole("button", { name: "Use reading" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Type it myself" }));
  expect(props.onUseReading).not.toHaveBeenCalled();
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

test("service errors retain evidence and manual entry", () => {
  setup({ reading: undefined, error: "Provider unavailable" });
  expect(screen.getByRole("img")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Photo reading is unavailable",
  );
  expect(screen.getByRole("button", { name: "Use reading" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Type it myself" })).toBeEnabled();
});

test("processing state does not allow copying", () => {
  setup({ busy: true });
  expect(screen.getByRole("status")).toHaveTextContent("Reading photo");
  expect(screen.getByRole("button", { name: "Use reading" })).toBeDisabled();
});

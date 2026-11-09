// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ScalePhotoReader } from "./scale-photo-reader";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        uploadToSignedUrl: mocks.upload,
      }),
    },
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setup(result: unknown) {
  mocks.upload.mockResolvedValue({ error: null });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      json({ photoId: "p1", path: "org/p1.jpg", token: "signed-token" }),
    )
    .mockResolvedValueOnce(json(result));
  vi.stubGlobal("fetch", fetchMock);

  const onChange = vi.fn();
  const onBusyChange = vi.fn();
  render(
    <ScalePhotoReader
      onChange={onChange}
      onBusyChange={onBusyChange}
    />,
  );

  return { fetchMock, onChange, onBusyChange };
}

async function choosePhoto() {
  const user = userEvent.setup();
  const file = new File(["photo"], "gold.jpg", { type: "image/jpeg" });
  await user.upload(
    screen.getByLabelText("Scale or karat meter photo"),
    file,
  );
  return { user, file };
}

describe("ScalePhotoReader", () => {
  test("uploads through the signed token and displays the AI reading", async () => {
    const reading = {
      kind: "scale",
      confidence: "high",
      weight: { value: 53000, state: "ok" },
      purity: { value: null, state: "cant_read" },
      notes: "Display shows 53.00 g",
    };
    const { fetchMock, onChange, onBusyChange } = setup({
      ok: true,
      readingId: "r1",
      reading,
    });

    const { file } = await choosePhoto();

    expect(await screen.findByText(/Suggested weight:/)).toHaveTextContent(
      "53.000 g",
    );
    expect(screen.getByText(/Suggested purity:/)).toHaveTextContent(
      "Can't read",
    );
    expect(mocks.upload).toHaveBeenCalledWith(
      "org/p1.jpg",
      "signed-token",
      file,
      { contentType: "image/jpeg" },
    );
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/scale-photos/p1/read",
      { method: "POST" },
    ]);
    expect(onChange).toHaveBeenLastCalledWith({
      photoId: "p1",
      aiReadingId: "r1",
      reading,
    });
    await waitFor(() => {
      expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
    });
  });

  test("retains the reference to a rejected AI attempt for manual entry", async () => {
    const { onChange } = setup({
      ok: false,
      readingId: "r2",
      reason: "timeout",
    });

    await choosePhoto();

    expect(
      await screen.findByText(/AI could not read the photo \(timeout\)/),
    ).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({
      photoId: "p1",
      aiReadingId: "r2",
    });
  });

  test("keeps the uploaded photo attached when the reading request fails", async () => {
    const { fetchMock, onChange } = setup({});
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(
        json({ photoId: "p1", path: "org/p1.jpg", token: "signed-token" }),
      )
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await choosePhoto();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to fetch",
    );
    expect(onChange).toHaveBeenLastCalledWith({ photoId: "p1" });
    expect(
      screen.getByRole("button", { name: "Remove photo attachment" }),
    ).toBeEnabled();
  });

  test("does not attach a photo when uploading to storage fails", async () => {
    const { fetchMock, onChange } = setup({});
    mocks.upload.mockResolvedValue({ error: { message: "Upload failed" } });

    await choosePhoto();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Photo upload failed",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls).toEqual([[null]]);
  });

  test("rejects unsupported formats before making requests", async () => {
    const { fetchMock } = setup({});
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(
      screen.getByLabelText("Scale or karat meter photo"),
      new File(["image"], "photo.heic", { type: "image/heic" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a JPEG, PNG or WebP image",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects oversized files before making requests", async () => {
    const { fetchMock } = setup({});
    const user = userEvent.setup();
    await user.upload(
      screen.getByLabelText("Scale or karat meter photo"),
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.jpg", {
        type: "image/jpeg",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "5 MB or smaller",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("allows removing a completed attachment", async () => {
    const { onChange } = setup({
      ok: false,
      readingId: "r2",
      reason: "malformed",
    });
    const { user } = await choosePhoto();

    await user.click(
      await screen.findByRole("button", { name: "Remove photo attachment" }),
    );

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(
      screen.queryByRole("button", { name: "Remove photo attachment" }),
    ).not.toBeInTheDocument();
  });
});

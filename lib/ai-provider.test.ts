import { describe, expect, test, vi } from "vitest";
import { parseAiReading, readScale } from "./ai-reading";
import { getAiConfig, readWithGemini, type AiConfig } from "./ai-provider";

const config: AiConfig = { apiKey: "secret-key", model: "test-model" };
const image = { bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" };
const reading = JSON.stringify({
  kind: "scale",
  weight_g: 112.45,
  purity_pct: 91.6,
  confidence: "high",
  notes: null,
});

function fakeFetch(body: unknown, status = 200) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("getAiConfig", () => {
  const valid = {
    AI_PROVIDER: "gemini",
    AI_API_KEY: "k",
    AI_MODEL: "m",
  };

  test("returns the key and model", () => {
    expect(getAiConfig(valid)).toEqual({ apiKey: "k", model: "m" });
  });

  test.each([
    [{ ...valid, AI_PROVIDER: "other" }, "AI_PROVIDER"],
    [{ ...valid, AI_PROVIDER: undefined }, "AI_PROVIDER"],
    [{ ...valid, AI_API_KEY: "" }, "AI_API_KEY"],
    [{ ...valid, AI_MODEL: undefined }, "AI_MODEL"],
  ])("rejects incomplete configuration %#", (env, name) => {
    expect(() => getAiConfig(env)).toThrow(name);
  });
});

describe("readWithGemini", () => {
  test("sends the documented request shape", async () => {
    const fetchFn = fakeFetch({ output_text: reading });
    const controller = new AbortController();

    await readWithGemini(config, image, controller.signal, fetchFn);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
    );
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBe(controller.signal);
    expect(init?.headers).toEqual({
      "x-goog-api-key": "secret-key",
      "Content-Type": "application/json",
      "Api-Revision": "2026-05-20",
    });

    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("test-model");
    expect(body.input[0].type).toBe("text");
    expect(body.input[1]).toEqual({
      type: "image",
      data: "AQID",
      mime_type: "image/png",
    });
    expect(body.response_format).toEqual({
      type: "text",
      mime_type: "application/json",
    });
  });

  test("reads a top-level output_text", async () => {
    const text = await readWithGemini(
      config,
      image,
      new AbortController().signal,
      fakeFetch({ output_text: reading }),
    );
    expect(text).toBe(reading);
  });

  test("reads a nested text item", async () => {
    const text = await readWithGemini(
      config,
      image,
      new AbortController().signal,
      fakeFetch({ steps: [{ content: [{ type: "text", text: reading }] }] }),
    );
    expect(text).toBe(reading);
  });

  test("throws without leaking the key when the request fails", async () => {
    const failure = readWithGemini(
      config,
      image,
      new AbortController().signal,
      fakeFetch({ error: "bad" }, 429),
    );
    await expect(failure).rejects.toThrow(
      "Gemini request failed with status 429",
    );
    await expect(failure).rejects.not.toThrow(/secret-key/);
  });

  test("throws when the response has no text", async () => {
    await expect(
      readWithGemini(
        config,
        image,
        new AbortController().signal,
        fakeFetch({ id: "x" }),
      ),
    ).rejects.toThrow("no text");
  });

  test("works end to end with the parser and timeout wrapper", async () => {
    const fetchFn = fakeFetch({ output_text: reading });
    const result = await readScale((signal) =>
      readWithGemini(config, image, signal, fetchFn),
    );
    expect(result).toEqual(parseAiReading(reading));
    expect(result.ok).toBe(true);
  });

  test("a failing provider becomes a provider_error state", async () => {
    const result = await readScale((signal) =>
      readWithGemini(config, image, signal, fakeFetch({}, 500)),
    );
    expect(result).toEqual({ ok: false, reason: "provider_error" });
  });
});

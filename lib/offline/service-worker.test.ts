import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";

function setup() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const offline = new Response("offline shell");
  const cache = {
    addAll: vi.fn().mockResolvedValue(undefined),
    match: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
  };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    match: vi.fn().mockResolvedValue(offline),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: {
      location: { origin: "https://karigar.test" },
      clients: { claim: vi.fn().mockResolvedValue(undefined) },
      addEventListener: (name: string, callback: (event: unknown) => void) => {
        handlers[name] = callback;
      },
    },
    caches,
    fetch,
    URL,
    Response,
  });
  return { handlers, caches, cache, fetch, offline };
}

test("installation caches only the non-sensitive offline page", async () => {
  const { handlers, cache } = setup();
  const waitUntil = vi.fn();
  handlers.install({ waitUntil });
  await waitUntil.mock.calls[0][0];
  expect(cache.addAll).toHaveBeenCalledWith(["/offline.html"]);
});

test.each([
  { method: "POST", url: "https://karigar.test/api/issues", mode: "cors" },
  { method: "GET", url: "https://karigar.test/api/stock", mode: "cors" },
  { method: "GET", url: "https://karigar.test/auth/signout", mode: "navigate" },
  {
    method: "GET",
    url: "https://storage.test/private/photo.jpg",
    mode: "cors",
  },
])("does not intercept private or mutating request: $url", (request) => {
  const { handlers } = setup();
  const respondWith = vi.fn();
  handlers.fetch({ request, respondWith });
  expect(respondWith).not.toHaveBeenCalled();
});

test("failed navigation returns fallback without caching authenticated HTML", async () => {
  const { handlers, cache, offline } = setup();
  const respondWith = vi.fn();
  handlers.fetch({
    request: {
      method: "GET",
      url: "https://karigar.test/receipt",
      mode: "navigate",
    },
    respondWith,
  });
  expect(await respondWith.mock.calls[0][0]).toBe(offline);
  expect(cache.put).not.toHaveBeenCalled();
});

import { loadDraft, saveDraft, type Owner } from "./store";

type Endpoint = "/api/karigars" | "/api/categories" | "/api/jobs";
type Cached<T> = { data: T; savedAt: number };

export async function readReference<T>(
  owner: Owner | undefined,
  endpoint: Endpoint,
  options: RequestInit = {},
  onCached?: (savedAt: number) => void,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(endpoint, {
      ...options,
      cache: "no-store",
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (!owner) throw error;
    const cached = await loadDraft<Cached<T>>(owner, `reference:${endpoint}`);
    if (!cached) throw error;
    onCached?.(cached.savedAt);
    return cached.data;
  }

  // A real server rejection must never be disguised as a successful cached read.
  if (!response.ok) {
    throw new Error(`Could not load reference data (${response.status}).`);
  }

  const data = (await response.json()) as T;
  if (owner) {
    await saveDraft(owner, `reference:${endpoint}`, {
      data,
      savedAt: Date.now(),
    }).catch(() => {
      // A cache-write failure must not discard a successful network response.
    });
  }
  return data;
}

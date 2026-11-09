const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/interactions";
const API_REVISION = "2026-05-20";

export const READING_PROMPT = [
  "You read the display of a jewellery weighing scale or a karat meter printout.",
  "Return only a JSON object with exactly these keys:",
  '{"kind": "scale" or "karat_meter", "weight_g": number or null, "purity_pct": number or null, "confidence": "high" or "low" or "unreadable", "notes": short string or null}',
  "weight_g is the weight in grams with at most 3 decimals.",
  "purity_pct is the purity as a percentage with at most 2 decimals.",
  "Use null for any value you cannot read clearly. Do not guess.",
  "Use confidence high only when every digit is clearly legible.",
  "Return no text outside the JSON object.",
].join("\n");

export type AiConfig = { apiKey: string; model: string };
export type AiImage = { bytes: Uint8Array; contentType: string };

export function getAiConfig(
  env: Record<string, string | undefined> = process.env,
): AiConfig {
  if (env.AI_PROVIDER !== "gemini") {
    throw new Error("AI_PROVIDER must be set to gemini");
  }
  if (!env.AI_API_KEY) throw new Error("AI_API_KEY is not configured");
  if (!env.AI_MODEL) throw new Error("AI_MODEL is not configured");
  return { apiKey: env.AI_API_KEY, model: env.AI_MODEL };
}

function findText(node: unknown): string | null {
  if (typeof node !== "object" || node === null) return null;
  const record = node as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  if (record.type === "text" && typeof record.text === "string") {
    return record.text;
  }
  for (const value of Object.values(record)) {
    const found = findText(value);
    if (found !== null) return found;
  }
  return null;
}

export async function readWithGemini(
  config: AiConfig,
  image: AiImage,
  signal: AbortSignal,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchFn(ENDPOINT, {
    method: "POST",
    signal,
    headers: {
      "x-goog-api-key": config.apiKey,
      "Content-Type": "application/json",
      "Api-Revision": API_REVISION,
    },
    body: JSON.stringify({
      model: config.model,
      input: [
        { type: "text", text: READING_PROMPT },
        {
          type: "image",
          data: Buffer.from(image.bytes).toString("base64"),
          mime_type: image.contentType,
        },
      ],
      response_format: { type: "text", mime_type: "application/json" },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}`);
  }

  const text = findText(await response.json());
  if (text === null) throw new Error("Gemini response contained no text");
  return text;
}

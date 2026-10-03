import { env, logger } from "@viktor/config";

export type InputType = "document" | "query";

const MODEL = "voyage-3.5";

/** Returns null when no embedding provider is configured; memory search then falls back to full-text. */
export async function embed(text: string, inputType: InputType): Promise<number[] | null> {
  const key = env().VOYAGE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, input: [text], input_type: inputType }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`voyage ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return body.data[0]?.embedding ?? null;
  } catch (err) {
    logger.warn({ err }, "embedding failed, continuing without vector search");
    return null;
  }
}

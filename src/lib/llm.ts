import OpenAI from "openai";

const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIM = 768;

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local before calling OpenAI-backed endpoints."
    );
  }
  return key;
}

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: getApiKey() });
  }
  return _client;
}

export type ChatOptions = {
  jsonMode?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
};

export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  opts: ChatOptions = {}
): Promise<string> {
  const client = getClient();

  const res = await client.chat.completions.create({
    model: opts.model ?? DEFAULT_CHAT_MODEL,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxOutputTokens ?? 2048,
    response_format: opts.jsonMode ? { type: "json_object" } : undefined,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const text = res.choices?.[0]?.message?.content ?? "";
  return text.trim();
}

export async function embedText(text: string): Promise<number[]> {
  const client = getClient();
  const res = await client.embeddings.create({
    model: EMBED_MODEL,
    input: text,
    dimensions: EMBED_DIM,
  });
  const values = res.data?.[0]?.embedding;
  if (!values || values.length === 0) {
    throw new Error("OpenAI embeddings returned no values");
  }
  return values;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = getClient();
  const res = await client.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
    dimensions: EMBED_DIM,
  });
  const out = (res.data ?? []).map((d) => d.embedding ?? []);
  if (out.length !== texts.length || out.some((v) => v.length === 0)) {
    throw new Error(
      `OpenAI embeddings returned malformed output (got ${out.length} for ${texts.length} inputs)`
    );
  }
  return out;
}

export function stripJsonFences(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json|javascript|js)?/i, "").trim();
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3).trim();
  }
  return cleaned;
}

export function safeJsonParse<T = unknown>(raw: string, fallback: T): T {
  try {
    return JSON.parse(stripJsonFences(raw)) as T;
  } catch {
    const match = stripJsonFences(raw).match(/[\[{][\s\S]*[\]}]/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

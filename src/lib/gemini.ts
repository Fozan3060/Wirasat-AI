function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local before calling Gemini-backed endpoints."
    );
  }
  return key;
}

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768;
const CHAT_MODEL = "gemini-2.5-flash-lite";

export type ChatOptions = {
  jsonMode?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
};

export async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  opts: ChatOptions = {}
): Promise<string> {
  const apiKey = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${apiKey}`;

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.2,
    maxOutputTokens: opts.maxOutputTokens ?? 2048,
  };
  if (opts.jsonMode) generationConfig.responseMimeType = "application/json";

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini generateContent failed (${res.status}): ${errText.slice(0, 400)}`);
  }
  const data: any = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p: any) => (typeof p === "string" ? p : p?.text ?? ""))
    .join("")
    .trim();
}

export async function embedText(text: string): Promise<number[]> {
  const apiKey = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      outputDimensionality: EMBED_DIM,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini embedContent failed (${res.status}): ${body}`);
  }
  const data: any = await res.json();
  const values: number[] | undefined = data?.embedding?.values;
  if (!values || values.length === 0) {
    throw new Error("Gemini embedContent returned no values");
  }
  return values;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return Promise.all(texts.map((t) => embedText(t)));
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

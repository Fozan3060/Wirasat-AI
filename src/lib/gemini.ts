import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("[wirasat] GEMINI_API_KEY is not set. Agent calls will fail until it is configured in .env.local.");
}

export const geminiFlash = new ChatGoogleGenerativeAI({
  apiKey: apiKey ?? "",
  model: "gemini-2.0-flash",
  temperature: 0.2,
  maxOutputTokens: 2048,
});

export const geminiFlashCreative = new ChatGoogleGenerativeAI({
  apiKey: apiKey ?? "",
  model: "gemini-2.0-flash",
  temperature: 0.6,
  maxOutputTokens: 1024,
});

export const geminiEmbeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: apiKey ?? "",
  model: "text-embedding-004",
});

export const rawGenAI = new GoogleGenerativeAI(apiKey ?? "");

export async function embedText(text: string): Promise<number[]> {
  return geminiEmbeddings.embedQuery(text);
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  return geminiEmbeddings.embedDocuments(texts);
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

import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { GoogleGenerativeAI } from "@google/generative-ai";

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local before calling Gemini-backed endpoints."
    );
  }
  return key;
}

let _flash: ChatGoogleGenerativeAI | null = null;
let _flashCreative: ChatGoogleGenerativeAI | null = null;
let _embeddings: GoogleGenerativeAIEmbeddings | null = null;
let _rawGenAI: GoogleGenerativeAI | null = null;

export function getGeminiFlash(): ChatGoogleGenerativeAI {
  if (!_flash) {
    _flash = new ChatGoogleGenerativeAI({
      apiKey: getApiKey(),
      model: "gemini-2.0-flash",
      temperature: 0.2,
      maxOutputTokens: 2048,
    });
  }
  return _flash;
}

export function getGeminiFlashCreative(): ChatGoogleGenerativeAI {
  if (!_flashCreative) {
    _flashCreative = new ChatGoogleGenerativeAI({
      apiKey: getApiKey(),
      model: "gemini-2.0-flash",
      temperature: 0.6,
      maxOutputTokens: 1024,
    });
  }
  return _flashCreative;
}

export function getGeminiEmbeddings(): GoogleGenerativeAIEmbeddings {
  if (!_embeddings) {
    _embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: getApiKey(),
      model: "text-embedding-004",
    });
  }
  return _embeddings;
}

export function getRawGenAI(): GoogleGenerativeAI {
  if (!_rawGenAI) {
    _rawGenAI = new GoogleGenerativeAI(getApiKey());
  }
  return _rawGenAI;
}

export async function embedText(text: string): Promise<number[]> {
  return getGeminiEmbeddings().embedQuery(text);
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  return getGeminiEmbeddings().embedDocuments(texts);
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

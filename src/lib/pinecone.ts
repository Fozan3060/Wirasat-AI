import { Pinecone } from "@pinecone-database/pinecone";
import { embedText } from "./gemini";

const apiKey = process.env.PINECONE_API_KEY;
const indexName = process.env.PINECONE_INDEX ?? "wirasat-kb";

if (!apiKey) {
  console.warn("[wirasat] PINECONE_API_KEY is not set. Retrieval will fail until it is configured in .env.local.");
}

let _client: Pinecone | null = null;

export function getPinecone(): Pinecone {
  if (!_client) {
    _client = new Pinecone({ apiKey: apiKey ?? "" });
  }
  return _client;
}

export function getIndex() {
  return getPinecone().index(indexName);
}

export type LegalChunk = {
  text: string;
  section: string;
  score: number;
};

export async function queryLegalRules(
  query: string,
  opts: { topK?: number; minScore?: number } = {}
): Promise<LegalChunk[]> {
  const topK = opts.topK ?? 8;
  const minScore = opts.minScore ?? 0.6;

  const vector = await embedText(query);
  const index = getIndex();

  const res = await index.query({
    vector,
    topK,
    includeMetadata: true,
  });

  const matches = res.matches ?? [];
  return matches
    .filter((m) => (m.score ?? 0) >= minScore)
    .map((m) => ({
      text: String(m.metadata?.text ?? ""),
      section: String(m.metadata?.section ?? "Unknown Section"),
      score: m.score ?? 0,
    }))
    .filter((c) => c.text.length > 0);
}

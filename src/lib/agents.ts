import { callLLM, safeJsonParse } from "./llm";
import { queryLegalRules, type LegalChunk } from "./pinecone";
import {
  CONVERSATION_SYSTEM_PROMPT,
  conversationSystemPrompt,
  calculatorSystemPrompt,
  conflictSystemPrompt,
  explainerSystemPrompt,
} from "./prompts";

export type Heir = { name: string; relationship: string };

export type CaseData = {
  deceased_name: string | null;
  assets: string[] | null;
  heirs: Heir[] | null;
  conflicts: string[] | null;
  language: "urdu" | "english" | "mixed" | null;
};

export type CalculatedShare = {
  heir_name: string;
  relationship: string;
  share_fraction: string;
  share_percent: string;
  law_reference: string;
  calculation_notes: string;
};

export type ConflictItem = {
  type: "error" | "warning" | "info";
  issue: string;
  law_reference: string;
  recommendation: string;
};

export async function collectCaseData(
  userMessage: string,
  responseLanguage?: "urdu" | "english" | "mixed"
): Promise<CaseData> {
  const systemPrompt = responseLanguage
    ? conversationSystemPrompt(responseLanguage)
    : CONVERSATION_SYSTEM_PROMPT;
  const raw = await callLLM(systemPrompt, userMessage, { jsonMode: true });
  const fallback: CaseData = {
    deceased_name: null,
    assets: null,
    heirs: null,
    conflicts: null,
    language: "english",
  };
  const parsed = safeJsonParse<CaseData>(raw, fallback);

  return {
    deceased_name: parsed.deceased_name ?? null,
    assets: Array.isArray(parsed.assets) ? parsed.assets : null,
    heirs: Array.isArray(parsed.heirs)
      ? parsed.heirs.filter((h) => h && typeof h.relationship === "string")
      : null,
    conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : null,
    language: parsed.language ?? "english",
  };
}

export async function retrieveLegalRules(caseData: CaseData): Promise<LegalChunk[]> {
  const relationships = (caseData.heirs ?? []).map((h) => h.relationship).filter(Boolean);
  const assets = (caseData.assets ?? []).join(", ");
  const conflictHints = (caseData.conflicts ?? []).join(", ");

  const queryParts = [
    relationships.length ? `Heirs: ${relationships.join(", ")}` : "",
    assets ? `Assets: ${assets}` : "",
    conflictHints ? `Issues: ${conflictHints}` : "",
    "inheritance Pakistan law Faraid Succession Act MFLO Shariat",
  ].filter(Boolean);

  const query = queryParts.join(". ");

  try {
    return await queryLegalRules(query, { topK: 8, minScore: 0.6 });
  } catch (err) {
    console.error("[wirasat] Pinecone query failed:", err);
    return [];
  }
}

export async function calculateShares(
  caseData: CaseData,
  legalRules: LegalChunk[]
): Promise<CalculatedShare[]> {
  const heirsBlock = JSON.stringify(caseData.heirs ?? [], null, 2);
  const rulesBlock = legalRules
    .map((r, i) => `${i + 1}. [${r.section}] ${r.text}`)
    .join("\n");

  const userPrompt = `Deceased: ${caseData.deceased_name ?? "(unknown)"}
Assets: ${(caseData.assets ?? []).join(", ") || "(unspecified)"}

Heirs:
${heirsBlock}

Relevant Pakistani legal rules retrieved from the knowledge base:
${rulesBlock || "(no rules retrieved — apply general Faraid + Succession Act knowledge)"}

Compute each heir's exact share. Return a JSON object: { "shares": [ ... ] }.`;

  const language = caseData.language ?? "english";
  const raw = await callLLM(calculatorSystemPrompt(language), userPrompt, {
    jsonMode: true,
    model: "gpt-4o",
  });
  const parsed = safeJsonParse<{ shares?: CalculatedShare[] }>(raw, {});
  return Array.isArray(parsed?.shares) ? parsed.shares : [];
}

export async function detectConflicts(
  caseData: CaseData,
  shares: CalculatedShare[]
): Promise<ConflictItem[]> {
  const userPrompt = `Case data:
${JSON.stringify(caseData, null, 2)}

Calculated shares:
${JSON.stringify(shares, null, 2)}

Analyze for legal conflicts and issues. Return a JSON object: { "conflicts": [ ... ] }.`;

  const language = caseData.language ?? "english";
  const raw = await callLLM(conflictSystemPrompt(language), userPrompt, { jsonMode: true });
  const parsed = safeJsonParse<{ conflicts?: ConflictItem[] }>(raw, {});
  return Array.isArray(parsed?.conflicts) ? parsed.conflicts : [];
}

export async function generateExplanation(
  shares: CalculatedShare[],
  conflicts: ConflictItem[],
  language: "urdu" | "english" | "mixed"
): Promise<string> {
  const sharesSummary = shares
    .map((s) => `${s.heir_name} (${s.relationship}): ${s.share_fraction} (${s.share_percent}) — ${s.law_reference}`)
    .join("\n");
  const conflictsSummary = conflicts.length
    ? conflicts.map((c) => `[${c.type.toUpperCase()}] ${c.issue} (${c.law_reference})`).join("\n")
    : "No conflicts detected.";

  const userPrompt = `Distribution:
${sharesSummary}

Conflicts:
${conflictsSummary}

Write a warm, plain-language summary (max 3 sentences) for the family.`;

  const text = await callLLM(explainerSystemPrompt(language), userPrompt, {
    temperature: 0.6,
    maxOutputTokens: 2048,
  });
  return text.trim();
}

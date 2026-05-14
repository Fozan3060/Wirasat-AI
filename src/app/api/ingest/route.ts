import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { embedBatch } from "@/lib/llm";
import { getIndex } from "@/lib/pinecone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Chunk = { id: string; section: string; text: string };

function splitBySection(raw: string): Chunk[] {
  const lines = raw.split(/\r?\n/);
  const chunks: Chunk[] = [];
  let current: { section: string; lines: string[] } | null = null;

  for (const line of lines) {
    const match = line.match(/^\[SECTION:\s*(.+?)\]\s*$/);
    if (match) {
      if (current) {
        const text = current.lines.join("\n").trim();
        if (text) {
          chunks.push({
            id: slugify(current.section),
            section: current.section,
            text,
          });
        }
      }
      current = { section: match[1].trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    const text = current.lines.join("\n").trim();
    if (text) {
      chunks.push({
        id: slugify(current.section),
        section: current.section,
        text,
      });
    }
  }

  return chunks;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export async function POST() {
  try {
    const filePath = path.join(process.cwd(), "src", "data", "faraid-rules.txt");
    const raw = await readFile(filePath, "utf-8");
    const chunks = splitBySection(raw);

    if (chunks.length === 0) {
      return NextResponse.json({ success: false, error: "No [SECTION] chunks found" }, { status: 400 });
    }

    const vectors = await embedBatch(chunks.map((c) => c.text));
    if (vectors.length !== chunks.length) {
      return NextResponse.json(
        { success: false, error: `Embedding count mismatch: got ${vectors.length}, expected ${chunks.length}` },
        { status: 500 }
      );
    }

    const records = chunks.map((c, i) => ({
      id: c.id,
      values: vectors[i],
      metadata: { section: c.section, text: c.text },
    }));

    const index = getIndex();
    const batchSize = 50;
    for (let i = 0; i < records.length; i += batchSize) {
      await index.upsert(records.slice(i, i + batchSize));
    }

    return NextResponse.json({ success: true, count: records.length });
  } catch (err: any) {
    console.error("[wirasat] ingest failed:", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? "Ingestion failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    info: "POST to this endpoint to (re)ingest the faraid-rules knowledge base into Pinecone.",
  });
}

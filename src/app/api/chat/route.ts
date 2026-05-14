import {
  collectCaseData,
  retrieveLegalRules,
  calculateShares,
  detectConflicts,
  generateExplanation,
} from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SSEEvent = { event: "agent" | "result" | "error"; data: unknown };

function encode(event: SSEEvent): Uint8Array {
  const payload = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
  return new TextEncoder().encode(payload);
}

export async function POST(req: Request) {
  let message = "";
  let responseLanguage: "urdu" | "english" | "mixed" | undefined;
  try {
    const body = await req.json();
    message = String(body?.message ?? "").trim();
    const rl = body?.responseLanguage;
    if (rl === "urdu" || rl === "english" || rl === "mixed") {
      responseLanguage = rl;
    }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!message) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: SSEEvent) => controller.enqueue(encode(event));
      const fail = (step: number, label: string, err: unknown) => {
        const details = err instanceof Error ? err.message : String(err);
        send({ event: "error", data: { error: `Agent ${step} failed: ${label}`, details } });
      };

      try {
        send({ event: "agent", data: { step: 1, label: "Parsing case details" } });
        const caseData = await collectCaseData(message, responseLanguage).catch((e) => {
          fail(1, "Parsing case details", e);
          throw e;
        });
        if (responseLanguage) caseData.language = responseLanguage;

        const heirCount = caseData.heirs?.length ?? 0;
        if (heirCount === 0) {
          send({ event: "agent", data: { step: 2, label: "Retrieving Pakistani law" } });
          send({ event: "agent", data: { step: 3, label: "Calculating legal shares" } });
          send({ event: "agent", data: { step: 4, label: "Checking for conflicts" } });
          send({ event: "agent", data: { step: 5, label: "Generating report" } });

          const language = caseData.language ?? "english";
          const isUrdu = language === "urdu";
          const missingInfoConflict = {
            type: "error" as const,
            issue: isUrdu
              ? "ہم آپ کی تفصیل سے ورثاء کی نشاندہی نہیں کر سکے۔ براہ کرم تمام زندہ خاندانی افراد کا ذکر کریں۔"
              : "We couldn't identify any heirs from your description. Inheritance shares cannot be calculated without knowing the surviving family.",
            law_reference: isUrdu ? "ان پٹ نامکمل" : "Input incomplete",
            recommendation: isUrdu
              ? "براہ کرم بیوی/شوہر، بیٹے، بیٹیاں، والد، والدہ، اور دیگر زندہ ورثاء کا واضح طور پر ذکر کریں۔"
              : "Please describe the surviving family — e.g. spouse, sons, daughters, father, mother — and any other living relatives. Then resubmit the case.",
          };

          send({
            event: "result",
            data: {
              deceased: caseData.deceased_name,
              assets: caseData.assets ?? [],
              heirs: [],
              conflicts: [missingInfoConflict],
              summary: isUrdu
                ? "ورثاء کی تفصیل کے بغیر حصوں کا حساب ممکن نہیں۔ براہ کرم زندہ خاندانی افراد کی فہرست شامل کریں۔"
                : "We need to know the surviving family members before we can compute shares. Please edit the case and list the spouse, children, parents, and any other living heirs.",
              language,
              retrieved_rules: [],
              incomplete: true,
            },
          });
          return;
        }

        send({ event: "agent", data: { step: 2, label: "Retrieving Pakistani law" } });
        const legalRules = await retrieveLegalRules(caseData).catch((e) => {
          fail(2, "Retrieving Pakistani law", e);
          throw e;
        });

        send({ event: "agent", data: { step: 3, label: "Calculating legal shares" } });
        const shares = await calculateShares(caseData, legalRules).catch((e) => {
          fail(3, "Calculating legal shares", e);
          throw e;
        });

        send({ event: "agent", data: { step: 4, label: "Checking for conflicts" } });
        const conflicts = await detectConflicts(caseData, shares).catch((e) => {
          fail(4, "Checking for conflicts", e);
          throw e;
        });

        send({ event: "agent", data: { step: 5, label: "Generating report" } });
        const language = caseData.language ?? "english";
        const summary = await generateExplanation(shares, conflicts, language).catch((e) => {
          fail(5, "Generating report", e);
          throw e;
        });

        send({
          event: "result",
          data: {
            deceased: caseData.deceased_name,
            assets: caseData.assets ?? [],
            heirs: shares,
            conflicts,
            summary,
            language,
            retrieved_rules: legalRules.map((r) => ({ section: r.section, score: r.score })),
            incomplete: false,
          },
        });
      } catch (err) {
        console.error("[wirasat] chat pipeline failed:", err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

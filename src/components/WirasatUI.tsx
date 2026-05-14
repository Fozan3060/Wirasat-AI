"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Lang = "en" | "ur";

type AgentStep = {
  step: number;
  label: string;
  status: "pending" | "active" | "done";
};

type HeirShare = {
  heir_name: string;
  relationship: string;
  share_fraction: string;
  share_percent: string;
  law_reference: string;
  calculation_notes: string;
};

type ConflictItem = {
  type: "error" | "warning" | "info";
  issue: string;
  law_reference: string;
  recommendation: string;
};

type ResultData = {
  deceased: string | null;
  assets: string[];
  heirs: HeirShare[];
  conflicts: ConflictItem[];
  summary: string;
  language: "urdu" | "english" | "mixed";
  incomplete?: boolean;
};

type Screen = "input" | "processing" | "results" | "error";

const STEP_LABELS_EN = [
  "Parsing case details",
  "Retrieving Pakistani law",
  "Calculating legal shares",
  "Checking for conflicts",
  "Generating report",
];

const STEP_LABELS_UR = [
  "تفصیلات کا تجزیہ",
  "پاکستانی قانون کی جستجو",
  "قانونی حصوں کا حساب",
  "تنازعات کی جانچ",
  "رپورٹ کی تیاری",
];

const UI = {
  en: {
    title: "Wirasat",
    subtitle: "Pakistan Inheritance Law Assistant",
    placeholder:
      "Describe the case in plain words. Include the deceased, their assets, and all heirs (e.g. wife, sons, daughters, parents)...",
    examplePrefix: "Example:",
    example:
      "My father passed away. He left a house in Gulshan, a shop in Saddar, and PKR 800,000 in savings. His heirs are: his wife, two sons (Kamran and Bilal), and two daughters (Sana and Nadia).",
    submit: "Calculate Inheritance",
    listening: "Listening...",
    mic: "Voice input",
    badges: ["Succession Act 1925", "MFLO 1961", "Shariat App Act 1962", "Contract Act 1872"],
    deceased: "Deceased",
    assets: "Assets",
    breakdown: "Legal Share Breakdown",
    conflicts: "Conflicts & Warnings",
    summary: "Plain Language Summary",
    newCase: "← New Case",
    export: "Export Certificate",
    speak: "🔊 Read aloud",
    stopSpeak: "⏹ Stop",
    disclaimer:
      "Informational only — not legal advice. Based on Pakistan Succession Act 1925, MFLO 1961 & Shariat Application Act 1962.",
    errorTitle: "Something went wrong",
    tryAgain: "Try again",
    none: "(none)",
    noHeirsTitle: "We need more information",
    noHeirsBody:
      "We couldn't identify any heirs from your description, so shares can't be calculated yet. Please go back and describe the surviving family — e.g. wife / husband, sons, daughters, father, mother, and any other living relatives.",
    editCase: "← Edit Case",
  },
  ur: {
    title: "وراثت",
    subtitle: "پاکستانی قانونِ وراثت کا مددگار",
    placeholder:
      "اپنا کیس آسان الفاظ میں لکھیں۔ متوفی، ان کی جائیداد، اور تمام ورثاء کا ذکر کریں (مثلاً بیوی، بیٹے، بیٹیاں، والدین)...",
    examplePrefix: "مثال:",
    example:
      "میرے والد کا انتقال ہو گیا۔ ان کے ورثاء میں ان کی بیوہ، دو بیٹے اور دو بیٹیاں ہیں۔",
    submit: "وراثت کا حساب کریں",
    listening: "سن رہا ہے...",
    mic: "آواز سے ان پٹ",
    badges: ["قانون وراثت 1925", "MFLO 1961", "شریعت ایکٹ 1962", "Contract Act 1872"],
    deceased: "متوفی",
    assets: "جائیداد",
    breakdown: "قانونی حصے",
    conflicts: "تنازعات و انتباہات",
    summary: "آسان زبان میں خلاصہ",
    newCase: "← نیا کیس",
    export: "سرٹیفکیٹ ڈاؤن لوڈ",
    speak: "🔊 سنیں",
    stopSpeak: "⏹ روکیں",
    disclaimer:
      "صرف معلوماتی۔ قانونی مشورہ نہیں۔ بنیاد: قانون وراثت 1925، MFLO 1961، شریعت اپلیکیشن ایکٹ 1962۔",
    errorTitle: "کچھ گڑبڑ ہو گئی",
    tryAgain: "دوبارہ کوشش کریں",
    none: "(کوئی نہیں)",
    noHeirsTitle: "مزید معلومات درکار ہیں",
    noHeirsBody:
      "ہم آپ کی تفصیل سے ورثاء کی نشاندہی نہیں کر سکے، اس لیے حصوں کا حساب ابھی ممکن نہیں۔ براہ کرم واپس جائیں اور زندہ خاندانی افراد کا ذکر کریں — جیسے بیوی/شوہر، بیٹے، بیٹیاں، والد، والدہ، اور دیگر زندہ رشتہ دار۔",
    editCase: "← کیس میں ترمیم کریں",
  },
} as const;

function makeInitialSteps(lang: Lang): AgentStep[] {
  const labels = lang === "ur" ? STEP_LABELS_UR : STEP_LABELS_EN;
  return labels.map((label, i) => ({
    step: i + 1,
    label,
    status: "pending" as const,
  }));
}

export default function WirasatUI() {
  const [lang, setLang] = useState<Lang>("en");
  const [screen, setScreen] = useState<Screen>("input");
  const [message, setMessage] = useState("");
  const [steps, setSteps] = useState<AgentStep[]>(() => makeInitialSteps("en"));
  const [result, setResult] = useState<ResultData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const recognitionRef = useRef<any>(null);
  const userStoppedRef = useRef<boolean>(true);
  const abortRef = useRef<AbortController | null>(null);
  const t = UI[lang];

  useEffect(() => {
    setSteps((prev) => {
      const labels = lang === "ur" ? STEP_LABELS_UR : STEP_LABELS_EN;
      return prev.map((s, i) => ({ ...s, label: labels[i] }));
    });
  }, [lang]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      userStoppedRef.current = true;
      recognitionRef.current?.stop();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  const updateStep = useCallback((step: number, status: AgentStep["status"]) => {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.step < step) return { ...s, status: "done" };
        if (s.step === step) return { ...s, status };
        return { ...s, status: "pending" };
      })
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!message.trim()) return;
    setScreen("processing");
    setErrorMsg(null);
    setResult(null);
    setSteps(makeInitialSteps(lang));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          responseLanguage: lang === "ur" ? "urdu" : "english",
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Request failed with status ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIdx;
        while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          const lines = rawEvent.split("\n");
          let eventName = "message";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
          }
          if (!dataLine) continue;
          let payload: any;
          try {
            payload = JSON.parse(dataLine);
          } catch {
            continue;
          }

          if (eventName === "agent") {
            updateStep(payload.step, "active");
          } else if (eventName === "result") {
            setSteps((prev) => prev.map((s) => ({ ...s, status: "done" })));
            setResult(payload as ResultData);
            setScreen("results");
          } else if (eventName === "error") {
            throw new Error(payload?.error ?? "Pipeline error");
          }
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setErrorMsg(err?.message ?? "Unexpected error");
      setScreen("error");
    } finally {
      abortRef.current = null;
    }
  }, [message, lang, updateStep]);

  const startVoiceInput = useCallback(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert(lang === "ur" ? "آپ کا براؤزر آواز سپورٹ نہیں کرتا" : "Voice input is not supported in this browser.");
      return;
    }
    const recognition = new SR();
    recognition.lang = lang === "ur" ? "ur-PK" : "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    userStoppedRef.current = false;

    recognition.onresult = (e: any) => {
      let finalChunk = "";
      for (let i = e.resultIndex ?? 0; i < e.results.length; i++) {
        const result = e.results[i];
        if (result?.isFinal) {
          finalChunk += result[0]?.transcript ?? "";
        }
      }
      const trimmed = finalChunk.trim();
      if (trimmed) {
        setMessage((cur) => (cur ? cur + " " + trimmed : trimmed));
      }
    };

    recognition.onerror = (e: any) => {
      console.log("[wirasat mic] error:", e?.error);
      if (e?.error === "no-speech" || e?.error === "audio-capture" || e?.error === "aborted") {
        return;
      }
      userStoppedRef.current = true;
      setListening(false);
    };

    recognition.onend = () => {
      console.log("[wirasat mic] onend — userStopped:", userStoppedRef.current);
      if (userStoppedRef.current) {
        setListening(false);
        return;
      }
      window.setTimeout(() => {
        if (userStoppedRef.current) {
          setListening(false);
          return;
        }
        try {
          recognition.start();
          console.log("[wirasat mic] restarted");
        } catch (err) {
          console.warn("[wirasat mic] restart failed:", err);
          window.setTimeout(() => {
            if (userStoppedRef.current) {
              setListening(false);
              return;
            }
            try {
              recognition.start();
              console.log("[wirasat mic] restarted on second try");
            } catch (err2) {
              console.error("[wirasat mic] giving up:", err2);
              setListening(false);
            }
          }, 500);
        }
      }, 200);
    };

    recognition.onstart = () => console.log("[wirasat mic] onstart");
    recognition.onspeechend = () => console.log("[wirasat mic] onspeechend (silence detected)");

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [lang]);

  const stopVoiceInput = useCallback(() => {
    userStoppedRef.current = true;
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const speakSummary = useCallback(() => {
    if (!result || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const isUrdu = result.language === "urdu";
    const text = buildSpokenReport(result, isUrdu);
    if (!text) return;

    const utter = new SpeechSynthesisUtterance(text);
    const voiceLang =
      result.language === "urdu" ? "ur-PK" : result.language === "mixed" ? "ur-PK" : "en-US";
    utter.lang = voiceLang;
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find((v) => v.lang?.toLowerCase().startsWith(voiceLang.slice(0, 2)));
    if (match) utter.voice = match;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  }, [result]);

  const stopSpeaking = useCallback(() => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const resetCase = useCallback(() => {
    abortRef.current?.abort();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setScreen("input");
    setResult(null);
    setErrorMsg(null);
    setMessage("");
    setSteps(makeInitialSteps(lang));
    setSpeaking(false);
  }, [lang]);

  const exportCertificate = useCallback(() => {
    if (!result) return;
    const lines: string[] = [];
    lines.push("WIRASAT AI — Inheritance Distribution Certificate");
    lines.push("(Informational only — not legal advice)");
    lines.push("");
    lines.push(`Deceased: ${result.deceased ?? "(unspecified)"}`);
    lines.push(`Assets: ${result.assets.join(", ") || "(unspecified)"}`);
    lines.push("");
    lines.push("Legal Share Breakdown:");
    result.heirs.forEach((h, i) => {
      lines.push(
        `${i + 1}. ${h.heir_name} — ${h.relationship} — ${h.share_fraction} (${h.share_percent}) — ${h.law_reference}`
      );
      if (h.calculation_notes) lines.push(`   Note: ${h.calculation_notes}`);
    });
    if (result.conflicts.length) {
      lines.push("");
      lines.push("Conflicts / Warnings:");
      result.conflicts.forEach((c, i) => {
        lines.push(`${i + 1}. [${c.type.toUpperCase()}] ${c.issue} (${c.law_reference})`);
        lines.push(`   Recommendation: ${c.recommendation}`);
      });
    }
    lines.push("");
    lines.push("Summary:");
    lines.push(result.summary);
    lines.push("");
    lines.push("References: Pakistan Succession Act 1925, MFLO 1961, Shariat Application Act 1962, Contract Act 1872.");

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wirasat-${(result.deceased ?? "case").replace(/\s+/g, "-").toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result]);

  const dir = lang === "ur" ? "rtl" : "ltr";

  return (
    <div className="wirasat-root" dir={dir}>
      <Aurora />
      <Header lang={lang} onLangChange={setLang} t={t} />

      {screen === "input" && (
        <InputScreen
          t={t}
          message={message}
          setMessage={setMessage}
          listening={listening}
          onMicStart={startVoiceInput}
          onMicStop={stopVoiceInput}
          onSubmit={handleSubmit}
        />
      )}

      {screen === "processing" && <ProcessingScreen steps={steps} />}

      {screen === "results" && result && (
        <ResultsScreen
          t={t}
          lang={lang}
          result={result}
          onNewCase={resetCase}
          onExport={exportCertificate}
          speaking={speaking}
          onSpeak={speakSummary}
          onStopSpeak={stopSpeaking}
        />
      )}

      {screen === "error" && (
        <ErrorScreen t={t} message={errorMsg ?? "Unknown error"} onRetry={resetCase} />
      )}

      <Disclaimer text={t.disclaimer} />
      <Styles />
    </div>
  );
}

function Aurora() {
  return (
    <div className="aurora" aria-hidden>
      <div className="aurora-blob aurora-1" />
      <div className="aurora-blob aurora-2" />
      <div className="aurora-blob aurora-3" />
      <div className="aurora-grid" />
    </div>
  );
}

function Header({
  lang,
  onLangChange,
  t,
}: {
  lang: Lang;
  onLangChange: (l: Lang) => void;
  t: typeof UI[Lang];
}) {
  return (
    <header className="header fade-up">
      <div className="header-row">
        <div className="title-block">
          <div className="brand-pill">
            <span className="brand-dot" />
            <span className="brand-label">AGENTIC AI · PAKISTAN</span>
          </div>
          <h1 className="title">
            {t.title} <span className="title-sparkle" aria-hidden>✦</span>
          </h1>
          <p className="subtitle">{t.subtitle}</p>
        </div>
        <div className="lang-toggle">
          <button
            type="button"
            className={lang === "en" ? "lang-btn active" : "lang-btn"}
            onClick={() => onLangChange("en")}
          >
            EN
          </button>
          <button
            type="button"
            className={lang === "ur" ? "lang-btn active" : "lang-btn"}
            onClick={() => onLangChange("ur")}
          >
            اردو
          </button>
        </div>
      </div>
      <div className="divider" />
    </header>
  );
}

function InputScreen({
  t,
  message,
  setMessage,
  listening,
  onMicStart,
  onMicStop,
  onSubmit,
}: {
  t: typeof UI[Lang];
  message: string;
  setMessage: (s: string) => void;
  listening: boolean;
  onMicStart: () => void;
  onMicStop: () => void;
  onSubmit: () => void;
}) {
  return (
    <section className="card fade-up">
      <div className="textarea-wrap">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t.placeholder}
          rows={7}
          className="input-textarea"
        />
        <button
          type="button"
          aria-label={t.mic}
          className={listening ? "mic-btn pulsing" : "mic-btn"}
          onClick={listening ? onMicStop : onMicStart}
        >
          {listening ? "●" : "🎙"}
        </button>
      </div>
      <p className="example">
        <span className="example-prefix">{t.examplePrefix}</span> {t.example}
      </p>
      <button
        type="button"
        className="submit-btn"
        onClick={onSubmit}
        disabled={!message.trim()}
      >
        {listening ? t.listening : t.submit}
      </button>
      <div className="badges">
        {t.badges.map((b) => (
          <span className="badge" key={b}>
            {b}
          </span>
        ))}
      </div>
    </section>
  );
}

const AGENT_GLYPHS = ["⌕", "❖", "∑", "△", "✎"];

function ProcessingScreen({ steps }: { steps: AgentStep[] }) {
  const activeCount = steps.filter((s) => s.status !== "pending").length;
  return (
    <section className="card processing fade-up">
      <div className="proc-header">
        <div className="proc-orbit" aria-hidden>
          <div className="proc-orbit-ring" />
          <div className="proc-orbit-ring r2" />
          <div className="proc-orbit-core">✦</div>
        </div>
        <div>
          <div className="proc-title">Wirasat agents are reasoning</div>
          <div className="proc-sub">
            Step {Math.min(activeCount, steps.length)} of {steps.length}
            <span className="dots inline-dots">
              <span /> <span /> <span />
            </span>
          </div>
        </div>
      </div>
      <ol className="timeline">
        {steps.map((s, idx) => (
          <li key={s.step} className={`tl-step tl-${s.status}`}>
            <div className="tl-node">
              <span className="tl-node-inner">
                {s.status === "done" ? "✓" : AGENT_GLYPHS[idx] ?? s.step}
              </span>
              {s.status === "active" && <span className="tl-pulse" />}
            </div>
            <div className="tl-body">
              <div className="tl-label">{s.label}</div>
              <div className="tl-status">
                {s.status === "done"
                  ? "Complete"
                  : s.status === "active"
                    ? "Running"
                    : "Queued"}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ResultsScreen({
  t,
  lang,
  result,
  onNewCase,
  onExport,
  speaking,
  onSpeak,
  onStopSpeak,
}: {
  t: typeof UI[Lang];
  lang: Lang;
  result: ResultData;
  onNewCase: () => void;
  onExport: () => void;
  speaking: boolean;
  onSpeak: () => void;
  onStopSpeak: () => void;
}) {
  const totalAssets = result.assets.length ? result.assets.join(", ") : t.none;
  const summaryDir = result.language === "urdu" ? "rtl" : "ltr";

  return (
    <section className="card fade-up">
      <div className="case-info">
        <div className="case-card">
          <div className="case-label">{t.deceased}</div>
          <div className="case-value">{result.deceased ?? t.none}</div>
        </div>
        <div className="case-card">
          <div className="case-label">{t.assets}</div>
          <div className="case-value">{totalAssets}</div>
        </div>
      </div>

      <SectionHeader title={t.breakdown} />
      {result.heirs.length === 0 ? (
        <div className="empty-heirs">
          <div className="empty-heirs-icon">⚠</div>
          <div className="empty-heirs-title">{t.noHeirsTitle}</div>
          <p className="empty-heirs-body">{t.noHeirsBody}</p>
          <button type="button" className="ghost-btn" onClick={onNewCase}>
            {t.editCase}
          </button>
        </div>
      ) : (
        <ul className="heir-list">
          {result.heirs.map((h, i) => {
            const palette = relationshipPalette(h.relationship);
            return (
              <li
                key={`${h.heir_name}-${i}`}
                className="heir-card stagger-in"
                style={{
                  animationDelay: `${i * 80}ms`,
                  ["--rel-color" as any]: palette.color,
                  ["--rel-glow" as any]: palette.glow,
                }}
              >
                <div className="heir-row">
                  <div className="heir-main">
                    <div className="heir-name-row">
                      <div className="heir-name">
                        {h.heir_name || (t.none as string)}
                      </div>
                      <span className={`rel-badge ${lang === "ur" ? "rel-badge-ur" : ""}`}>
                        <span className="rel-dot" />
                        {displayRelationship(h.relationship, lang)}
                      </span>
                    </div>
                  </div>
                  <div className="heir-share">
                    <div className="heir-fraction">{h.share_fraction}</div>
                    <div className="heir-percent">{h.share_percent}</div>
                  </div>
                </div>
                <div className="heir-bar">
                  <div
                    className="heir-bar-fill grow-bar"
                    style={{ width: clampPercent(h.share_percent) }}
                  />
                </div>
                <div className="heir-law">{h.law_reference}</div>
                {h.calculation_notes && <div className="heir-notes">{h.calculation_notes}</div>}
              </li>
            );
          })}
        </ul>
      )}

      {result.conflicts.length > 0 && (
        <>
          <SectionHeader title={t.conflicts} accent="conflict" />
          <ul className="conflict-list">
            {result.conflicts.map((c, i) => (
              <li
                key={i}
                className={`conflict-card stagger-in conflict-${c.type}`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="conflict-head">
                  <span className="conflict-icon">{c.type === "error" ? "⚠" : c.type === "warning" ? "▲" : "ℹ"}</span>
                  <span className="conflict-issue">{c.issue}</span>
                </div>
                <div className="conflict-law">{c.law_reference}</div>
                {c.recommendation && (
                  <div className="conflict-rec">{c.recommendation}</div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionHeader title={t.summary} />
      <div className="summary-box fade-up" dir={summaryDir}>
        <div className="summary-head">
          <div className="ai-avatar" aria-hidden>
            <span>✦</span>
          </div>
          <div className="ai-label">Wirasat · AI Advisor</div>
        </div>
        <p className="summary-text">{result.summary}</p>
        <div className="summary-actions">
          {!speaking ? (
            <button type="button" className="ghost-btn" onClick={onSpeak}>
              {t.speak}
            </button>
          ) : (
            <button type="button" className="ghost-btn" onClick={onStopSpeak}>
              {t.stopSpeak}
            </button>
          )}
        </div>
      </div>

      <div className="actions">
        <button type="button" className="ghost-btn" onClick={onNewCase}>
          {t.newCase}
        </button>
        <button type="button" className="submit-btn export-btn" onClick={onExport}>
          {t.export}
        </button>
      </div>
    </section>
  );
}

function ErrorScreen({
  t,
  message,
  onRetry,
}: {
  t: typeof UI[Lang];
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="card fade-up">
      <h2 className="error-title">{t.errorTitle}</h2>
      <p className="error-msg">{message}</p>
      <button type="button" className="submit-btn" onClick={onRetry}>
        {t.tryAgain}
      </button>
    </section>
  );
}

function SectionHeader({ title, accent }: { title: string; accent?: "conflict" }) {
  return (
    <div className={accent === "conflict" ? "section-header conflict" : "section-header"}>
      <h2>{title}</h2>
      <div className="section-line" />
    </div>
  );
}

function Disclaimer({ text }: { text: string }) {
  return <p className="disclaimer">{text}</p>;
}

function clampPercent(raw: string): string {
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) return "0%";
  const n = Math.max(0, Math.min(100, parseFloat(match[1])));
  return `${n}%`;
}

const RELATIONSHIP_UR: Record<string, string> = {
  wife: "بیوی",
  husband: "شوہر",
  son: "بیٹا",
  daughter: "بیٹی",
  father: "والد",
  mother: "والدہ",
  brother: "بھائی",
  sister: "بہن",
  grandson: "پوتا",
  granddaughter: "پوتی",
  other: "دیگر",
};

function displayRelationship(rel: string, lang: Lang): string {
  if (!rel) return rel;
  if (lang === "ur") return RELATIONSHIP_UR[rel.toLowerCase()] ?? rel;
  return rel;
}

function relationshipPalette(rel: string): { color: string; glow: string } {
  const r = rel.toLowerCase();
  if (r === "wife" || r === "husband") return { color: "#E27396", glow: "rgba(226,115,150,0.25)" };
  if (r === "son") return { color: "#7AB8E2", glow: "rgba(122,184,226,0.25)" };
  if (r === "daughter") return { color: "#C28BE2", glow: "rgba(194,139,226,0.25)" };
  if (r === "father" || r === "mother") return { color: "#E2C07A", glow: "rgba(226,192,122,0.25)" };
  if (r === "brother" || r === "sister") return { color: "#8DD8B5", glow: "rgba(141,216,181,0.25)" };
  if (r === "grandson" || r === "granddaughter")
    return { color: "#A1A1FF", glow: "rgba(161,161,255,0.25)" };
  return { color: "#D4AF37", glow: "rgba(212,175,55,0.25)" };
}

function buildSpokenReport(result: ResultData, isUrdu: boolean): string {
  const parts: string[] = [];

  const deceasedLabel = result.deceased ?? (isUrdu ? "متوفی" : "the deceased");

  if (result.heirs.length === 0) {
    return result.summary || "";
  }

  parts.push(
    isUrdu
      ? `${deceasedLabel} کی وراثت کی تقسیم درج ذیل ہے۔`
      : `Here is the inheritance distribution for ${deceasedLabel}.`
  );

  for (const h of result.heirs) {
    const who = h.heir_name && h.heir_name.toLowerCase() !== "null"
      ? `${h.heir_name} (${h.relationship})`
      : h.relationship;
    if (isUrdu) {
      parts.push(`${who} کا حصہ ${h.share_fraction} ہے، یعنی تقریباً ${h.share_percent}۔`);
    } else {
      parts.push(`${who} receives ${h.share_fraction}, which is about ${h.share_percent}.`);
    }
  }

  if (result.conflicts.length > 0) {
    parts.push(isUrdu ? "اہم انتباہات:" : "Important warnings:");
    for (const c of result.conflicts) {
      parts.push(c.issue);
    }
  }

  if (result.summary) {
    parts.push(result.summary);
  }

  return parts.join(" ");
}

function Styles() {
  return (
    <style jsx global>{`
      :root {
        --gold: #f5d062;
        --gold-bright: #ffe084;
        --gold-dim: #d4af37;
        --bg: #08070a;
        --bg-2: #0d0c10;
        --surface: rgba(255, 255, 255, 0.035);
        --surface-2: rgba(255, 255, 255, 0.06);
        --border: rgba(245, 208, 98, 0.22);
        --border-strong: rgba(245, 208, 98, 0.5);
        --text: #fbecc5;
        --text-bright: #fff8e3;
        --text-muted: #b9a878;
        --conflict: #ff7468;
        --warning: #ffd066;
        --info: #88baea;
      }
      html,
      body {
        margin: 0;
        padding: 0;
        background: var(--bg);
        color: var(--text);
        font-family: var(--font-crimson, Georgia, serif);
        min-height: 100vh;
        -webkit-font-smoothing: antialiased;
      }
      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }
      .wirasat-root {
        position: relative;
        max-width: 820px;
        margin: 0 auto;
        padding: 56px 24px 80px;
        z-index: 1;
      }
      .aurora {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 0;
        overflow: hidden;
      }
      .aurora-blob {
        position: absolute;
        border-radius: 50%;
        filter: blur(110px);
        opacity: 0.55;
      }
      .aurora-1 {
        width: 460px;
        height: 460px;
        top: -120px;
        right: -120px;
        background: radial-gradient(circle, rgba(212, 175, 55, 0.35), transparent 70%);
      }
      .aurora-2 {
        width: 540px;
        height: 540px;
        bottom: -160px;
        left: -160px;
        background: radial-gradient(circle, rgba(184, 150, 46, 0.25), transparent 70%);
        opacity: 0.5;
      }
      .aurora-3 {
        width: 360px;
        height: 360px;
        top: 40%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: radial-gradient(circle, rgba(232, 213, 163, 0.06), transparent 70%);
        animation: pulse-bg 8s ease-in-out infinite;
      }
      .aurora-grid {
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(rgba(212, 175, 55, 0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(212, 175, 55, 0.04) 1px, transparent 1px);
        background-size: 48px 48px;
        mask-image: radial-gradient(ellipse at center, black 40%, transparent 75%);
      }
      @keyframes pulse-bg {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 0.6; }
      }
      .header-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }
      .title-block {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .brand-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 4px 10px;
        border: 1px solid var(--border-strong);
        background: rgba(245, 208, 98, 0.08);
        border-radius: 999px;
        font-size: 10.5px;
        letter-spacing: 1.4px;
        color: var(--gold-bright);
        width: fit-content;
        font-weight: 600;
      }
      .brand-dot {
        width: 6px;
        height: 6px;
        background: var(--gold);
        border-radius: 50%;
        box-shadow: 0 0 8px var(--gold);
        animation: blink 2s ease-in-out infinite;
      }
      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.35; }
      }
      .brand-label {
        font-family: var(--font-crimson, Georgia, serif);
      }
      .title {
        font-family: var(--font-cormorant, Georgia, serif);
        color: var(--gold);
        font-size: 48px;
        margin: 0;
        letter-spacing: 0.5px;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        gap: 12px;
        background: linear-gradient(180deg, #fff0b8, #f5d062);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        text-shadow: 0 0 30px rgba(245, 208, 98, 0.2);
      }
      .title-sparkle {
        font-size: 22px;
        color: var(--gold-bright);
        -webkit-text-fill-color: var(--gold-bright);
        animation: sparkle 3s ease-in-out infinite;
      }
      @keyframes sparkle {
        0%, 100% { transform: scale(1) rotate(0); opacity: 0.7; }
        50% { transform: scale(1.15) rotate(8deg); opacity: 1; }
      }
      .subtitle {
        color: var(--text);
        margin: 2px 0 0 0;
        font-size: 14.5px;
        letter-spacing: 0.4px;
        opacity: 0.85;
      }
      .lang-toggle {
        display: flex;
        gap: 6px;
      }
      .lang-btn {
        background: transparent;
        color: var(--text-muted);
        border: 1px solid var(--text-muted);
        padding: 4px 10px;
        font-size: 12px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: inherit;
      }
      .lang-btn.active {
        background: linear-gradient(135deg, var(--gold), var(--gold-dim));
        color: var(--bg);
        border-color: var(--gold);
        font-weight: 600;
      }
      .lang-btn:hover {
        border-color: var(--gold);
        color: var(--gold);
      }
      .lang-btn.active:hover {
        color: var(--bg);
      }
      .divider {
        height: 1px;
        background: linear-gradient(90deg, transparent, var(--gold), transparent);
        margin: 24px 0 32px;
      }
      .card {
        position: relative;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.01));
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 32px;
        margin-bottom: 24px;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        box-shadow:
          0 1px 0 0 rgba(212, 175, 55, 0.08) inset,
          0 30px 60px -30px rgba(0, 0, 0, 0.6);
      }
      .card::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: 16px;
        padding: 1px;
        background: linear-gradient(135deg, rgba(212, 175, 55, 0.4), rgba(212, 175, 55, 0) 50%, rgba(212, 175, 55, 0.2));
        -webkit-mask:
          linear-gradient(#fff 0 0) content-box,
          linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        pointer-events: none;
      }
      .textarea-wrap {
        position: relative;
      }
      .input-textarea {
        width: 100%;
        background: rgba(0, 0, 0, 0.45);
        color: var(--text-bright);
        border: 1px solid rgba(212, 175, 55, 0.22);
        border-radius: 12px;
        padding: 18px 60px 18px 18px;
        font-family: inherit;
        font-size: 16px;
        line-height: 1.55;
        resize: vertical;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
        outline: none;
        backdrop-filter: blur(8px);
      }
      .input-textarea::placeholder {
        color: var(--text-muted);
      }
      .input-textarea:focus {
        border-color: var(--gold);
        box-shadow: 0 0 0 4px rgba(212, 175, 55, 0.12), 0 0 24px rgba(212, 175, 55, 0.15);
      }
      .mic-btn {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 42px;
        height: 42px;
        border-radius: 50%;
        border: 1px solid rgba(212, 175, 55, 0.4);
        background: rgba(0, 0, 0, 0.6);
        color: var(--gold);
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        backdrop-filter: blur(8px);
      }
      .mic-btn:hover {
        border-color: var(--gold);
        box-shadow: 0 0 16px rgba(212, 175, 55, 0.25);
      }
      .mic-btn.pulsing {
        color: var(--conflict);
        border-color: var(--conflict);
        background: rgba(239, 107, 94, 0.1);
        animation: mic-pulse 1.5s ease-out infinite;
      }
      @keyframes mic-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(239, 107, 94, 0.5); }
        50% { box-shadow: 0 0 0 14px rgba(239, 107, 94, 0); }
      }
      .example {
        color: var(--text);
        font-size: 13.5px;
        margin: 12px 4px 20px;
        line-height: 1.55;
        opacity: 0.8;
      }
      .example-prefix {
        color: var(--gold);
        font-weight: 600;
        opacity: 1;
      }
      .submit-btn {
        width: 100%;
        position: relative;
        background: linear-gradient(135deg, var(--gold-bright), var(--gold-dim));
        color: var(--bg);
        border: none;
        padding: 15px 18px;
        font-size: 16px;
        font-weight: 600;
        border-radius: 12px;
        cursor: pointer;
        font-family: inherit;
        letter-spacing: 0.6px;
        transition: transform 0.15s ease, opacity 0.2s ease, box-shadow 0.2s ease;
        box-shadow: 0 12px 24px -12px rgba(212, 175, 55, 0.55);
        overflow: hidden;
      }
      .submit-btn::after {
        content: "";
        position: absolute;
        top: 0;
        left: -120%;
        width: 60%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.25), transparent);
        transition: left 0.6s ease;
      }
      .submit-btn:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 16px 30px -12px rgba(212, 175, 55, 0.75);
      }
      .submit-btn:hover:not(:disabled)::after {
        left: 120%;
      }
      .submit-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .badges {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 22px;
        justify-content: center;
      }
      .badge {
        font-size: 11px;
        color: var(--gold);
        border: 1px solid rgba(245, 208, 98, 0.35);
        background: rgba(245, 208, 98, 0.06);
        padding: 5px 11px;
        border-radius: 999px;
        letter-spacing: 0.6px;
        font-family: var(--font-crimson, Georgia, serif);
        transition: all 0.2s ease;
        font-weight: 500;
      }
      .badge:hover {
        color: var(--gold-bright);
        border-color: var(--gold);
        background: rgba(245, 208, 98, 0.12);
      }
      .processing {
        padding: 36px 32px 32px;
      }
      .proc-header {
        display: flex;
        align-items: center;
        gap: 18px;
        margin-bottom: 28px;
      }
      .proc-orbit {
        position: relative;
        width: 64px;
        height: 64px;
        flex-shrink: 0;
      }
      .proc-orbit-ring {
        position: absolute;
        inset: 0;
        border: 1px solid rgba(212, 175, 55, 0.3);
        border-top-color: var(--gold);
        border-radius: 50%;
        animation: spin 1.4s linear infinite;
      }
      .proc-orbit-ring.r2 {
        inset: 8px;
        border-color: rgba(212, 175, 55, 0.18);
        border-bottom-color: var(--gold-dim);
        animation: spin 2.2s linear infinite reverse;
      }
      .proc-orbit-core {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--gold-bright);
        font-size: 20px;
        animation: sparkle 2.5s ease-in-out infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      .proc-title {
        font-family: var(--font-cormorant, Georgia, serif);
        color: var(--gold);
        font-size: 24px;
        line-height: 1.1;
      }
      .proc-sub {
        color: var(--text-muted);
        font-size: 13px;
        letter-spacing: 0.4px;
        margin-top: 4px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .inline-dots span {
        width: 3px;
        height: 3px;
      }
      .timeline {
        list-style: none;
        padding: 0;
        margin: 0;
        position: relative;
      }
      .timeline::before {
        content: "";
        position: absolute;
        left: 19px;
        top: 18px;
        bottom: 18px;
        width: 1px;
        background: linear-gradient(180deg, rgba(212, 175, 55, 0.4), rgba(212, 175, 55, 0.08));
      }
      .tl-step {
        display: flex;
        align-items: flex-start;
        gap: 16px;
        padding: 10px 4px;
        position: relative;
        z-index: 1;
      }
      .tl-node {
        position: relative;
        width: 40px;
        height: 40px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .tl-node-inner {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: var(--bg-2);
        border: 1px solid rgba(212, 175, 55, 0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-muted);
        font-size: 16px;
        transition: all 0.4s ease;
        position: relative;
      }
      .tl-pending .tl-node-inner {
        color: var(--text-muted);
      }
      .tl-active .tl-node-inner {
        background: linear-gradient(135deg, var(--gold), var(--gold-dim));
        color: var(--bg);
        border-color: var(--gold);
        box-shadow: 0 0 24px rgba(212, 175, 55, 0.45);
      }
      .tl-done .tl-node-inner {
        background: rgba(212, 175, 55, 0.15);
        color: var(--gold-bright);
        border-color: var(--gold);
      }
      .tl-pulse {
        position: absolute;
        inset: -4px;
        border-radius: 50%;
        border: 1px solid var(--gold);
        animation: ring-pulse 1.6s ease-out infinite;
      }
      @keyframes ring-pulse {
        0% { transform: scale(0.85); opacity: 0.9; }
        100% { transform: scale(1.5); opacity: 0; }
      }
      .tl-body {
        flex: 1;
        padding-top: 8px;
      }
      .tl-label {
        font-family: var(--font-cormorant, Georgia, serif);
        color: var(--text);
        font-size: 18px;
        line-height: 1.2;
        transition: color 0.3s ease;
      }
      .tl-active .tl-label {
        color: var(--gold-bright);
      }
      .tl-done .tl-label {
        color: var(--text);
      }
      .tl-pending .tl-label {
        color: var(--text);
        opacity: 0.55;
      }
      .tl-status {
        font-size: 11px;
        letter-spacing: 1.2px;
        text-transform: uppercase;
        margin-top: 3px;
        color: var(--text-muted);
        font-weight: 600;
      }
      .tl-active .tl-status {
        color: var(--gold-bright);
      }
      .tl-done .tl-status {
        color: var(--gold);
      }
      .dots {
        display: inline-flex;
        gap: 4px;
      }
      .dots span {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: var(--gold);
        animation: dot-bounce 1s infinite ease-in-out;
      }
      .dots span:nth-child(2) { animation-delay: 0.15s; }
      .dots span:nth-child(3) { animation-delay: 0.3s; }
      @keyframes dot-bounce {
        0%, 80%, 100% { transform: scale(0.5); opacity: 0.4; }
        40% { transform: scale(1); opacity: 1; }
      }
      .case-info {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-bottom: 28px;
      }
      .case-card {
        background: linear-gradient(180deg, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.2));
        border: 1px solid rgba(212, 175, 55, 0.2);
        border-radius: 12px;
        padding: 16px 18px;
        position: relative;
        overflow: hidden;
      }
      .case-card::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 3px;
        height: 100%;
        background: linear-gradient(180deg, var(--gold), transparent);
        opacity: 0.6;
      }
      .case-label {
        font-size: 10.5px;
        color: var(--gold);
        letter-spacing: 1.5px;
        text-transform: uppercase;
        margin-bottom: 8px;
        font-weight: 600;
      }
      .case-value {
        font-family: var(--font-cormorant, Georgia, serif);
        color: var(--text-bright);
        font-size: 19px;
        line-height: 1.3;
      }
      .section-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 28px 0 14px;
      }
      .section-header h2 {
        font-family: var(--font-cormorant, Georgia, serif);
        color: var(--gold);
        font-size: 22px;
        margin: 0;
      }
      .section-header.conflict h2 {
        color: var(--conflict);
      }
      .section-line {
        flex: 1;
        height: 1px;
        background: linear-gradient(90deg, rgba(212, 175, 55, 0.5), transparent);
      }
      .section-header.conflict .section-line {
        background: linear-gradient(90deg, rgba(231, 76, 60, 0.5), transparent);
      }
      .heir-list,
      .conflict-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .heir-card {
        position: relative;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.005));
        border: 1px solid rgba(212, 175, 55, 0.14);
        border-left: 3px solid var(--rel-color, var(--gold));
        border-radius: 12px;
        padding: 16px 18px 14px;
        margin-bottom: 12px;
        transition: transform 0.2s ease, box-shadow 0.3s ease, border-color 0.3s ease;
      }
      .heir-card:hover {
        transform: translateY(-1px);
        box-shadow: 0 8px 24px -16px var(--rel-glow, rgba(212,175,55,0.25));
        border-color: rgba(212, 175, 55, 0.28);
      }
      .heir-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
      }
      .heir-main {
        flex: 1;
        min-width: 0;
      }
      .heir-name-row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .heir-name {
        font-family: var(--font-cormorant, Georgia, serif);
        font-size: 22px;
        color: var(--text-bright);
        line-height: 1.1;
      }
      .rel-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 9px 3px 7px;
        border-radius: 999px;
        background: color-mix(in oklab, var(--rel-color, var(--gold)) 12%, transparent);
        color: var(--rel-color, var(--gold));
        font-size: 11px;
        letter-spacing: 1px;
        text-transform: uppercase;
        font-family: var(--font-crimson, Georgia, serif);
        border: 1px solid color-mix(in oklab, var(--rel-color, var(--gold)) 30%, transparent);
      }
      .rel-badge-ur {
        text-transform: none;
        letter-spacing: 0;
        font-size: 13px;
        padding: 3px 10px;
      }
      .rel-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--rel-color, var(--gold));
        box-shadow: 0 0 8px var(--rel-glow, rgba(212,175,55,0.4));
      }
      .heir-share {
        text-align: right;
        flex-shrink: 0;
      }
      .heir-fraction {
        font-family: var(--font-cormorant, Georgia, serif);
        color: var(--gold-bright);
        font-size: 34px;
        line-height: 1;
        font-weight: 500;
      }
      .heir-percent {
        color: var(--gold);
        font-size: 13.5px;
        margin-top: 4px;
        font-family: ui-monospace, "SF Mono", Menlo, monospace;
        letter-spacing: 0.5px;
        font-weight: 500;
      }
      .heir-bar {
        background: rgba(212, 175, 55, 0.06);
        height: 5px;
        border-radius: 999px;
        margin: 14px 0 10px;
        overflow: hidden;
        position: relative;
      }
      .heir-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--rel-color, var(--gold-dim)), var(--gold-bright));
        border-radius: 999px;
        transform-origin: left;
        animation: grow-bar 1.1s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        box-shadow: 0 0 12px var(--rel-glow, rgba(212,175,55,0.3));
      }
      .grow-bar {
        animation: grow-bar 1.1s cubic-bezier(0.22, 1, 0.36, 1) forwards;
      }
      @keyframes grow-bar {
        from { transform: scaleX(0); }
        to { transform: scaleX(1); }
      }
      .heir-law {
        font-family: ui-monospace, "SF Mono", Menlo, monospace;
        font-size: 11px;
        color: var(--gold);
        letter-spacing: 0.4px;
        text-transform: uppercase;
        opacity: 0.85;
      }
      .heir-notes {
        margin-top: 8px;
        font-size: 13.5px;
        color: var(--text);
        font-style: italic;
        line-height: 1.5;
        opacity: 0.8;
      }
      .empty-heirs {
        background: rgba(231, 76, 60, 0.06);
        border: 1px solid rgba(231, 76, 60, 0.4);
        border-radius: 10px;
        padding: 22px 22px 18px;
        margin-bottom: 18px;
        text-align: center;
      }
      .empty-heirs-icon {
        color: var(--conflict);
        font-size: 28px;
        line-height: 1;
        margin-bottom: 10px;
      }
      .empty-heirs-title {
        font-family: var(--font-cormorant, Georgia, serif);
        color: var(--conflict);
        font-size: 22px;
        margin-bottom: 8px;
      }
      .empty-heirs-body {
        color: var(--text);
        font-size: 14px;
        line-height: 1.5;
        margin: 0 0 16px;
        opacity: 0.9;
      }
      .conflict-card {
        background: rgba(231, 76, 60, 0.06);
        border-left: 3px solid var(--conflict);
        border-radius: 6px;
        padding: 12px 14px;
        margin-bottom: 12px;
      }
      .conflict-card.conflict-warning {
        background: rgba(212, 175, 55, 0.06);
        border-left-color: var(--gold);
      }
      .conflict-card.conflict-info {
        background: rgba(255, 255, 255, 0.03);
        border-left-color: var(--text-muted);
      }
      .conflict-head {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        color: var(--text);
      }
      .conflict-icon {
        color: var(--conflict);
        font-size: 16px;
      }
      .conflict-card.conflict-warning .conflict-icon {
        color: var(--gold);
      }
      .conflict-card.conflict-info .conflict-icon {
        color: var(--text-muted);
      }
      .conflict-law {
        font-family: ui-monospace, "SF Mono", Menlo, monospace;
        font-size: 11.5px;
        color: var(--gold);
        margin-top: 5px;
        letter-spacing: 0.3px;
      }
      .conflict-rec {
        margin-top: 8px;
        font-size: 13.5px;
        color: var(--text-bright);
        line-height: 1.5;
        opacity: 0.95;
      }
      .summary-box {
        position: relative;
        background: linear-gradient(180deg, rgba(212, 175, 55, 0.08), rgba(212, 175, 55, 0.02));
        border: 1px solid rgba(212, 175, 55, 0.28);
        border-radius: 16px;
        padding: 20px 22px;
        margin-bottom: 26px;
      }
      .summary-head {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
      }
      .ai-avatar {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--gold), var(--gold-dim));
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--bg);
        font-size: 14px;
        box-shadow: 0 0 16px rgba(212, 175, 55, 0.45);
      }
      .ai-label {
        font-size: 11.5px;
        letter-spacing: 1.4px;
        text-transform: uppercase;
        color: var(--gold-bright);
        font-weight: 600;
      }
      .summary-text {
        font-family: var(--font-cormorant, Georgia, serif);
        color: var(--text-bright);
        font-size: 19px;
        line-height: 1.6;
        margin: 0 0 14px 0;
        font-style: italic;
      }
      .summary-actions {
        display: flex;
        justify-content: flex-end;
      }
      .actions {
        display: flex;
        gap: 12px;
        margin-top: 8px;
      }
      .ghost-btn {
        background: rgba(212, 175, 55, 0.04);
        border: 1px solid rgba(212, 175, 55, 0.5);
        color: var(--gold);
        padding: 12px 18px;
        font-size: 14px;
        border-radius: 10px;
        cursor: pointer;
        font-family: inherit;
        letter-spacing: 0.3px;
        transition: all 0.2s ease;
        backdrop-filter: blur(8px);
      }
      .ghost-btn:hover {
        background: rgba(212, 175, 55, 0.12);
        border-color: var(--gold);
        box-shadow: 0 0 16px rgba(212, 175, 55, 0.2);
      }
      .export-btn {
        width: auto;
        flex: 1;
      }
      .disclaimer {
        text-align: center;
        font-size: 11.5px;
        color: var(--text);
        margin-top: 32px;
        line-height: 1.5;
        padding: 0 16px;
        opacity: 0.65;
      }
      .error-title {
        font-family: var(--font-cormorant, Georgia, serif);
        color: var(--conflict);
        font-size: 24px;
        margin: 0 0 10px;
      }
      .error-msg {
        color: var(--text-muted);
        margin: 0 0 18px;
        font-size: 14px;
      }
      .fade-up {
        animation: fade-up 0.5s ease-out both;
      }
      .stagger-in {
        opacity: 0;
        animation: fade-up 0.45s ease-out forwards;
      }
      @keyframes fade-up {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @media (max-width: 600px) {
        .case-info {
          grid-template-columns: 1fr;
        }
        .actions {
          flex-direction: column;
        }
        .title {
          font-size: 30px;
        }
      }
    `}</style>
  );
}

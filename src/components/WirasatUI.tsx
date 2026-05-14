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
        body: JSON.stringify({ message }),
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
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) setMessage((cur) => (cur ? cur + " " + transcript : transcript));
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [lang]);

  const stopVoiceInput = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const speakSummary = useCallback(() => {
    if (!result?.summary || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(result.summary);
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
        <div>
          <h1 className="title">{t.title}</h1>
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

function ProcessingScreen({ steps }: { steps: AgentStep[] }) {
  return (
    <section className="card processing fade-up">
      <div className="spinner" aria-label="Loading" />
      <ul className="steps">
        {steps.map((s) => (
          <li key={s.step} className={`step step-${s.status}`}>
            <span className="step-icon">
              {s.status === "done" ? "✓" : s.status === "active" ? "●" : "○"}
            </span>
            <span className="step-label">{s.label}</span>
            {s.status === "active" && (
              <span className="dots">
                <span /> <span /> <span />
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResultsScreen({
  t,
  result,
  onNewCase,
  onExport,
  speaking,
  onSpeak,
  onStopSpeak,
}: {
  t: typeof UI[Lang];
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
          {result.heirs.map((h, i) => (
            <li
              key={`${h.heir_name}-${i}`}
              className="heir-card stagger-in"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="heir-row">
                <div className="heir-main">
                  <div className="heir-name">{h.heir_name}</div>
                  <div className="heir-rel">{h.relationship}</div>
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
          ))}
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

function Styles() {
  return (
    <style jsx global>{`
      :root {
        --gold: #d4af37;
        --gold-dim: #b8962e;
        --bg: #0d0c0a;
        --surface: rgba(255, 255, 255, 0.03);
        --text: #e8d5a3;
        --text-muted: #5a5040;
        --conflict: #e74c3c;
      }
      html,
      body {
        margin: 0;
        padding: 0;
        background: var(--bg);
        color: var(--text);
        font-family: var(--font-crimson, Georgia, serif);
        min-height: 100vh;
      }
      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }
      .wirasat-root {
        max-width: 760px;
        margin: 0 auto;
        padding: 48px 24px 80px;
      }
      .header-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }
      .title {
        font-family: var(--font-cormorant, Georgia, serif);
        color: var(--gold);
        font-size: 38px;
        margin: 0;
        letter-spacing: 0.5px;
      }
      .subtitle {
        color: var(--text-muted);
        margin: 4px 0 0 0;
        font-size: 14px;
        letter-spacing: 0.5px;
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
        background: var(--surface);
        border: 1px solid rgba(212, 175, 55, 0.18);
        border-radius: 12px;
        padding: 28px;
        margin-bottom: 24px;
      }
      .textarea-wrap {
        position: relative;
      }
      .input-textarea {
        width: 100%;
        background: rgba(0, 0, 0, 0.4);
        color: var(--text);
        border: 1px solid rgba(212, 175, 55, 0.25);
        border-radius: 8px;
        padding: 16px 52px 16px 16px;
        font-family: inherit;
        font-size: 16px;
        resize: vertical;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
        outline: none;
      }
      .input-textarea::placeholder {
        color: var(--text-muted);
      }
      .input-textarea:focus {
        border-color: var(--gold);
        box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.12);
      }
      .mic-btn {
        position: absolute;
        top: 10px;
        right: 10px;
        width: 38px;
        height: 38px;
        border-radius: 50%;
        border: 1px solid var(--gold);
        background: rgba(0, 0, 0, 0.6);
        color: var(--gold);
        cursor: pointer;
        font-size: 16px;
      }
      .mic-btn.pulsing {
        animation: pulse-ring 1.2s ease-out infinite;
        color: var(--conflict);
        border-color: var(--conflict);
      }
      @keyframes pulse-ring {
        0% {
          box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.6);
        }
        100% {
          box-shadow: 0 0 0 12px rgba(212, 175, 55, 0);
        }
      }
      .example {
        color: var(--text-muted);
        font-size: 13px;
        margin: 12px 4px 20px;
        line-height: 1.5;
      }
      .example-prefix {
        color: var(--gold-dim);
        font-weight: 600;
      }
      .submit-btn {
        width: 100%;
        background: linear-gradient(135deg, var(--gold), var(--gold-dim));
        color: var(--bg);
        border: none;
        padding: 14px 18px;
        font-size: 16px;
        font-weight: 600;
        border-radius: 8px;
        cursor: pointer;
        font-family: inherit;
        letter-spacing: 0.5px;
        transition: transform 0.15s ease, opacity 0.2s ease;
      }
      .submit-btn:hover:not(:disabled) {
        transform: translateY(-1px);
      }
      .submit-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .badges {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 18px;
        justify-content: center;
      }
      .badge {
        font-size: 11px;
        color: var(--gold-dim);
        border: 1px solid rgba(212, 175, 55, 0.3);
        padding: 4px 10px;
        border-radius: 999px;
        letter-spacing: 0.5px;
      }
      .processing {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 40px 28px;
      }
      .spinner {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        border: 3px solid rgba(212, 175, 55, 0.18);
        border-top-color: var(--gold);
        animation: spin 1s linear infinite;
        margin-bottom: 28px;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      .steps {
        list-style: none;
        padding: 0;
        margin: 0;
        width: 100%;
        max-width: 420px;
      }
      .step {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 4px;
        color: var(--text-muted);
        transition: color 0.3s ease;
      }
      .step-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: 1px solid currentColor;
        font-size: 12px;
      }
      .step.step-active {
        color: var(--gold);
        text-shadow: 0 0 12px rgba(212, 175, 55, 0.4);
      }
      .step.step-done {
        color: var(--gold);
      }
      .step.step-done .step-icon {
        background: var(--gold);
        color: var(--bg);
        border-color: var(--gold);
      }
      .dots {
        display: inline-flex;
        gap: 4px;
        margin-left: auto;
      }
      .dots span {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: var(--gold);
        animation: dot-bounce 1s infinite ease-in-out;
      }
      .dots span:nth-child(2) {
        animation-delay: 0.15s;
      }
      .dots span:nth-child(3) {
        animation-delay: 0.3s;
      }
      @keyframes dot-bounce {
        0%,
        80%,
        100% {
          transform: scale(0.5);
          opacity: 0.4;
        }
        40% {
          transform: scale(1);
          opacity: 1;
        }
      }
      .case-info {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
        margin-bottom: 24px;
      }
      .case-card {
        background: rgba(0, 0, 0, 0.35);
        border: 1px solid rgba(212, 175, 55, 0.2);
        border-radius: 8px;
        padding: 14px 16px;
      }
      .case-label {
        font-size: 11px;
        color: var(--text-muted);
        letter-spacing: 1px;
        text-transform: uppercase;
        margin-bottom: 6px;
      }
      .case-value {
        font-family: var(--font-cormorant, Georgia, serif);
        color: var(--text);
        font-size: 18px;
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
        background: rgba(0, 0, 0, 0.3);
        border-left: 3px solid var(--gold);
        border-radius: 6px;
        padding: 14px 16px;
        margin-bottom: 12px;
      }
      .heir-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
      }
      .heir-main {
        flex: 1;
      }
      .heir-name {
        font-family: var(--font-cormorant, Georgia, serif);
        font-size: 20px;
        color: var(--text);
      }
      .heir-rel {
        font-size: 12px;
        color: var(--text-muted);
        text-transform: capitalize;
        letter-spacing: 0.5px;
      }
      .heir-share {
        text-align: right;
      }
      .heir-fraction {
        font-family: var(--font-cormorant, Georgia, serif);
        color: var(--gold);
        font-size: 28px;
        line-height: 1;
      }
      .heir-percent {
        color: var(--gold-dim);
        font-size: 13px;
        margin-top: 2px;
      }
      .heir-bar {
        background: rgba(212, 175, 55, 0.08);
        height: 6px;
        border-radius: 3px;
        margin: 12px 0 10px;
        overflow: hidden;
      }
      .heir-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--gold-dim), var(--gold));
        border-radius: 3px;
        transform-origin: left;
        animation: grow-bar 0.9s ease-out forwards;
      }
      .grow-bar {
        animation: grow-bar 0.9s ease-out forwards;
      }
      @keyframes grow-bar {
        from {
          transform: scaleX(0);
        }
        to {
          transform: scaleX(1);
        }
      }
      .heir-law {
        font-family: ui-monospace, "SF Mono", Menlo, monospace;
        font-size: 11px;
        color: var(--gold-dim);
        letter-spacing: 0.4px;
      }
      .heir-notes {
        margin-top: 6px;
        font-size: 12px;
        color: var(--text-muted);
        font-style: italic;
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
        font-size: 11px;
        color: var(--gold-dim);
        margin-top: 4px;
      }
      .conflict-rec {
        margin-top: 6px;
        font-size: 13px;
        color: var(--text);
        opacity: 0.85;
      }
      .summary-box {
        background: rgba(212, 175, 55, 0.05);
        border: 1px solid rgba(212, 175, 55, 0.25);
        border-radius: 8px;
        padding: 18px 20px;
        margin-bottom: 24px;
      }
      .summary-text {
        font-family: var(--font-cormorant, Georgia, serif);
        font-style: italic;
        color: var(--text);
        font-size: 18px;
        line-height: 1.55;
        margin: 0 0 12px 0;
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
        background: transparent;
        border: 1px solid var(--gold);
        color: var(--gold);
        padding: 12px 16px;
        font-size: 14px;
        border-radius: 8px;
        cursor: pointer;
        font-family: inherit;
        transition: background 0.15s ease;
      }
      .ghost-btn:hover {
        background: rgba(212, 175, 55, 0.08);
      }
      .export-btn {
        width: auto;
        flex: 1;
      }
      .disclaimer {
        text-align: center;
        font-size: 11px;
        color: var(--text-muted);
        margin-top: 32px;
        line-height: 1.5;
        padding: 0 16px;
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

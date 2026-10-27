"use client";
import { useEffect, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  ChartNoAxesCombined,
  Scale,
  Wallet,
  Sparkles,
  FileText,
  MessageSquare,
  RotateCcw,
} from "lucide-react";
import { companies, researchCompanies } from "@/lib/mock-data";
import { FinnMark } from "./app-shell";
import { PageHeading } from "./ui";
import type { ResearchAnswer, ResearchStatus } from "@/lib/research";
const topics = [
  {
    id: "business",
    icon: BookOpen,
    title: "Understand the business",
    question: "What drives revenue and how is the business mix changing?",
    description: "Segments, revenue mix & the bigger picture",
  },
  {
    id: "cash",
    icon: Wallet,
    title: "Follow the cash",
    question: "Do accounting profits translate into operating cash flow?",
    description: "Cash conversion, debt & balance sheet",
  },
  {
    id: "narrative",
    icon: ChartNoAxesCombined,
    title: "Check the narrative",
    question: "What did management promise, and what did it deliver?",
    description: "Management guidance vs. actual results",
  },
  {
    id: "bull",
    icon: Scale,
    title: "See both sides",
    question: "What would strengthen or challenge the investment case?",
    description: "A balanced bull and bear perspective",
  },
];
export function ResearchView() {
  const [symbol, setSymbol] = useState("TCS");
  const [companySearch, setCompanySearch] = useState("TCS");
  const [question, setQuestion] = useState("");
  const [submitted, setSubmitted] = useState<{
    symbol: string;
    question: string;
  } | null>(null);
  const [topic, setTopic] = useState("business");
  const [status, setStatus] = useState<ResearchStatus | null>(null);
  const [answer, setAnswer] = useState<ResearchAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStatus(null);
    setStatusError(null);
    fetch(`/api/research/status?symbol=${encodeURIComponent(symbol)}`, {
      signal: AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(155_000),
      ]),
      cache: "no-store",
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok)
          throw new Error(data.error || "Could not load research sources.");
        if (!controller.signal.aborted) setStatus(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setStatusError(
            e instanceof Error ? e.message : "Could not load research sources.",
          );
      });
    return () => controller.abort();
  }, [symbol, refresh]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const company = params.get("company");
    if (company && /^[A-Z0-9&-]{1,20}$/.test(company)) {
      setSymbol(company);
      setCompanySearch(company);
    }
    const t = topics.find((t) => t.id === params.get("topic"));
    if (t) {
      setTopic(t.id);
      setQuestion(t.question);
    }
  }, []);
  const options = [
    ...researchCompanies,
    ...companies
      .filter((c) => !researchCompanies.some((r) => r.symbol === c.symbol))
      .map((c) => ({ symbol: c.symbol, name: c.name })),
  ];
  const selected = options.find((c) => c.symbol === symbol) || {
    name: status?.name || symbol,
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || loading) return;
    setSubmitted({ symbol, question: question.trim() });
    setAnswer(null);
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/research/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, question: question.trim() }),
        signal: AbortSignal.timeout(155_000),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "The research request could not be completed.",
        );
      setAnswer(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Research is unavailable. Please retry.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="THE RESEARCH ROOM"
        title="Start with a good question."
        description="A dedicated space to look beneath the numbers."
      />
      <div className="mock-notice research-disclosure">
        <BookOpen size={15} />
        <span>
          <strong>Research from primary documents.</strong> Select a company to
          retrieve its available filings. Answers use the reports listed here;
          verify the cited evidence before making investment decisions.
        </span>
      </div>
      <div className="research-layout">
        <section className="research-workspace">
          <div className="research-welcome">
            <div className="research-emblem">
              <FinnMark />
            </div>
            <span className="coming-pill">
              <span />
              DOCUMENT RESEARCH
            </span>
            <h2>
              Curiosity is a good
              <br />
              investment.
            </h2>
            <p>
              Ask about the selected company’s business, financials, or
              management commentary. Every answer starts with its annual report
              and earnings-call transcript.
            </p>
          </div>
          <form className="research-composer" onSubmit={submit}>
            <div className="composer-top">
              <label htmlFor="research-company">RESEARCHING</label>
              <input
                id="research-company"
                aria-label="Company name or NSE ticker"
                list="research-company-options"
                value={companySearch}
                disabled={loading}
                onChange={(e) => setCompanySearch(e.target.value)}
                placeholder="Company name or NSE ticker"
              />
              <datalist id="research-company-options">
                {options.map((c) => (
                  <option key={c.symbol} value={c.symbol}>
                    {c.name}
                  </option>
                ))}
              </datalist>
              <button
                type="button"
                className="text-button"
                disabled={loading || !companySearch.trim()}
                onClick={() => {
                  const value = companySearch.trim();
                  const found = options.find(
                    (c) =>
                      c.name.toLowerCase() === value.toLowerCase() ||
                      c.symbol.toLowerCase() === value.toLowerCase(),
                  );
                  setStatus(null);
                  setSubmitted(null);
                  setAnswer(null);
                  setError(null);
                  setSymbol(found?.symbol || value.toUpperCase());
                  setRefresh((n) => n + 1);
                }}
              >
                Load sources
              </button>
            </div>
            <textarea
              disabled={loading}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={`What would you like to understand about ${selected.name}?`}
              aria-label="Research question"
              maxLength={1000}
              rows={3}
            />
            <div className="composer-bottom">
              <span>
                <Sparkles size={14} />
                {loading
                  ? "Searching documents & checking evidence…"
                  : "Answers grounded in company documents"}
              </span>
              <button
                className="send-button"
                type="submit"
                disabled={
                  !question.trim() ||
                  (companySearch.trim().toUpperCase() !== symbol &&
                    companySearch.trim().toLowerCase() !==
                      selected.name.toLowerCase()) ||
                  loading ||
                  !status?.documents_ready ||
                  !status?.api_key_configured
                }
                aria-label="Ask FINN"
              >
                <ArrowUp size={20} />
              </button>
            </div>
          </form>
          <div className="research-service-state" role="status">
            {status?.warnings?.map((w) => (
              <p key={w}>{w} Answers use only the available documents.</p>
            ))}
            {!status && !statusError && (
              <p>
                Preparing company documents… The first download may take a
                minute.
              </p>
            )}
            {(statusError || status?.error) && (
              <p>{statusError || status?.error}</p>
            )}
            {status && !status.api_key_configured && (
              <p>
                Documents are available independently of AI access. Add a Gemini
                API key to <code>backend/.env</code> and restart the backend to
                enable answers.
              </p>
            )}
            {(statusError ||
              status?.error ||
              (status && !status.api_key_configured)) && (
              <button
                className="text-button"
                onClick={() => setRefresh((n) => n + 1)}
              >
                Refresh connection <RotateCcw size={13} />
              </button>
            )}
          </div>
          {submitted ? (
            <section className="research-response" aria-live="polite">
              <div className="response-heading">
                <MessageSquare size={18} />
                <strong>
                  {loading ? "Researching your question" : "Your research"}
                </strong>
              </div>
              <h3>{submitted.question}</h3>
              <span className="response-company">{submitted.symbol}</span>
              {loading && (
                <p>Finding relevant passages and checking source references…</p>
              )}
              {error && (
                <p role="alert">
                  {error} Your question is kept above so you can retry.
                </p>
              )}
              {answer?.status === "insufficient_evidence" && (
                <p>{answer.message}</p>
              )}
              {answer?.claims.map((claim, index) => (
                <p key={index}>
                  {claim.text}{" "}
                  {claim.citations.map((number) => (
                    <a
                      className="research-citation-ref"
                      key={number}
                      href={`#research-source-${number}`}
                      aria-label={`Source ${number}`}
                    >
                      [{number}]
                    </a>
                  ))}
                </p>
              ))}
              {!!answer?.citations.length && (
                <div className="research-citations">
                  <span className="eyebrow">SOURCE EVIDENCE</span>
                  {answer.citations.map((citation, index) => (
                    <div id={`research-source-${index + 1}`} key={index}>
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        [{index + 1}] {citation.document_name} · PDF page{" "}
                        {citation.page} <ArrowUpRight size={13} />
                      </a>
                      <details>
                        <summary>Read source excerpt</summary>
                        <blockquote>{citation.quote}</blockquote>
                      </details>
                    </div>
                  ))}
                </div>
              )}
              {answer && (
                <p className="research-answer-note">
                  {answer.model} · Based on retrieved passages from the listed
                  documents, not a complete audit. PDF page numbers may differ
                  from printed page labels.
                </p>
              )}
              <button
                className="text-button"
                disabled={loading}
                onClick={() => {
                  setAnswer(null);
                  setError(null);
                  setSubmitted(null);
                  setQuestion("");
                }}
              >
                <RotateCcw size={15} />
                Start another question
              </button>
            </section>
          ) : (
            <>
              <div className="suggestion-heading">
                <span>A FEW PLACES TO START</span>
                <span>Choose a research angle</span>
              </div>
              <div className="question-grid">
                {topics.map((t) => (
                  <button
                    key={t.id}
                    className={`question-card ${topic === t.id && question === t.question ? "selected" : ""}`}
                    onClick={() => {
                      setTopic(t.id);
                      setQuestion(t.question);
                    }}
                  >
                    <t.icon size={21} />
                    <ArrowUpRight size={15} />
                    <h3>{t.title}</h3>
                    <p>{t.description}</p>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
        <aside className="research-sidebar">
          <section className="panel sources-panel">
            <div className="eyebrow">BUILT ON EVIDENCE</div>
            <h2>The source matters.</h2>
            <p>
              Good research starts with what the company actually says and
              reports.
            </p>
            {status?.documents.map((doc) => (
              <div className="source-placeholder" key={doc.id}>
                <FileText size={20} />
                <div>
                  <a href={doc.url} target="_blank" rel="noopener noreferrer">
                    <strong>
                      {doc.name} <ArrowUpRight size={12} />
                    </strong>
                  </a>
                  <small>
                    {doc.kind} · {doc.period}
                  </small>
                  <small>
                    {doc.pages
                      ? `${doc.pages} PDF pages · Indexed ${new Date(doc.indexed_at!).toLocaleDateString("en-IN")}`
                      : "Awaiting document index"}
                  </small>
                  {!!doc.unreadable_pages?.length && (
                    <small>
                      {doc.unreadable_pages.length} pages have little or no
                      extractable text; images are not searched.
                    </small>
                  )}
                </div>
              </div>
            ))}
            <div className="source-note">
              <BookOpen size={17} />
              <span>
                {status?.documents_ready
                  ? "Official exchange filings. Answers link to the original PDF page and show the supporting excerpt. If evidence is missing, FINN says so."
                  : "Source documents must be downloaded and indexed before research is available."}
              </span>
            </div>
          </section>
          <section className="research-tip">
            <span className="eyebrow">THINK BEYOND THE HEADLINE</span>
            <p>
              “Revenue grew” is a fact.
              <br />
              <strong>“Did that growth turn into cash?”</strong>
              <br />
              is a better question.
            </p>
            <div className="tip-line" />
          </section>
        </aside>
      </div>
    </>
  );
}

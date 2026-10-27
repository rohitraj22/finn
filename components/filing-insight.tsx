import type { Announcement } from "@/lib/announcements";
export function FilingInsight({ filing: a }: { filing: Announcement }) {
  const ai = a.insight;
  if (ai?.status !== "available")
    return (
      <p className="filing-excerpt">
        {ai?.status === "pending"
          ? "AI analysis queued…"
          : ai?.error || "Rule-based labels · Not AI-analyzed"}
      </p>
    );
  return (
    <div className="filing-ai">
      <strong>AI insight · {ai.importance}</strong>
      <p>{ai.summary}</p>
      <details>
        <summary>Reasoning & filing evidence</summary>
        <p>{ai.reason}</p>
        <p>
          {ai.coverage} AI interpretation; verify against the original filing.
        </p>
        {ai.evidence?.map((e, i) => (
          <div key={i}>
            <a href={e.url} target="_blank" rel="noopener noreferrer">
              {e.page ? `PDF page ${e.page}` : "Exchange description"}
            </a>
            <blockquote>{e.text}</blockquote>
          </div>
        ))}
        <small>
          {ai.model} ·{" "}
          {ai.analyzed_at && new Date(ai.analyzed_at).toLocaleString("en-IN")}
        </small>
      </details>
    </div>
  );
}

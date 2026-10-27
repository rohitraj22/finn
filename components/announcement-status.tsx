"use client";
import { Clock3, RefreshCw } from "lucide-react";
import { useAnnouncements } from "./announcement-data-provider";
import { istTimestamp } from "@/lib/market-data";
export function AnnouncementStatus({ compact = false }: { compact?: boolean }) {
  const { data, items, loading, error, refresh } = useAnnouncements();
  const complete =
    data?.coverage.filter((c) => c.status === "available").length || 0;
  return (
    <div
      className={`market-status ${error || (data && data.status !== "ok") ? "market-warning" : ""}`}
      role="status"
      aria-live="polite"
    >
      <Clock3 size={16} />
      <div>
        <strong>
          {loading
            ? "Checking official exchange filings…"
            : error
              ? "Announcement feed unavailable"
              : data?.status === "ok"
                ? "Official exchange announcements"
                : "Announcement coverage is limited"}
        </strong>
        {data && (
          <span>
            {complete}/18 NSE company feeds checked successfully · Last checked{" "}
            {istTimestamp(data.last_attempt_at)}
            {data.cache_hit ? " · Cached response" : ""}
          </span>
        )}
        {error && (
          <span>
            {error}
            {items.length
              ? " Previously fetched filings are marked stale."
              : ""}
          </span>
        )}
        {!compact && (
          <small>
            NSE is the primary source. Official RSS is a limited-history
            fallback. AI insights are labeled separately; rule-based labels
            remain where AI is unavailable.
          </small>
        )}
        {data && data.status !== "ok" && (
          <span>
            Some companies or periods could not be checked completely. An empty
            list does not confirm there were no announcements.
          </span>
        )}
        {!compact && data && (
          <details className="announcement-coverage">
            <summary>Source coverage and refresh details</summary>
            <p>
              Next check: {istTimestamp(data.next_refresh_at)}. Query through:{" "}
              {istTimestamp(data.queried_to)}.
            </p>
            {data.sources.map((s) => (
              <p key={s.source}>
                <strong>{s.source}</strong>: {s.detail}
              </p>
            ))}
            {data.coverage
              .filter((c) => c.status !== "available")
              .map((c) => (
                <p key={c.symbol}>
                  <strong>{c.symbol}</strong>: {c.detail}
                </p>
              ))}
          </details>
        )}
      </div>
      <button
        className="button secondary"
        onClick={refresh}
        disabled={loading}
        aria-label="Refresh announcements"
      >
        <RefreshCw size={14} />
        {loading ? "Loading" : "Refresh"}
      </button>
    </div>
  );
}

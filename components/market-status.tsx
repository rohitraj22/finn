"use client";
import { RefreshCw, Clock3, FlaskConical } from "lucide-react";
import { useMarketData } from "./market-data-provider";
import { istTimestamp, Quote, volumeText } from "@/lib/market-data";
export function MarketStatus() {
  const { data, quotes, performance, loading, error, refresh } =
    useMarketData();
  const warnings = data?.quotes.some((q) => q.warnings.length);
  const availableCount = Object.values(quotes).filter(
    (q) => q.close !== null,
  ).length;
  return (
    <>
      <div className="mock-notice">
        <FlaskConical size={15} />
        <span>
          <strong>
            Demo portfolio — hypothetical holdings, real market data.
          </strong>
        </span>
        <span className="mock-label">YAHOO FINANCE</span>
      </div>
      <div
        className={`market-status ${error || data?.status === "stale" ? "market-warning" : ""}`}
        role="status"
        aria-live="polite"
      >
        <Clock3 size={16} />
        <div>
          <strong>
            {loading
              ? "Fetching latest available EOD data…"
              : error
                ? "Market data unavailable"
                : data?.status === "ok"
                  ? "End-of-day market data"
                  : "Market data partially available"}
            {data && ` · ${availableCount}/18 quotes`}
          </strong>
          {data?.latest_market_date && (
            <span>
              Session
              {data.oldest_market_date !== data.latest_market_date
                ? "s"
                : ""}:{" "}
              {data.oldest_market_date !== data.latest_market_date
                ? `${data.oldest_market_date} – `
                : ""}
              {data.latest_market_date} · Regular scheduled close 15:30 IST
            </span>
          )}
          {data && (
            <span>
              Last checked {istTimestamp(data.last_attempt_at)} · Next check{" "}
              {istTimestamp(data.next_refresh_at)}
              {data.cache_hit ? " · Cached response" : ""}
            </span>
          )}
          {error && (
            <span>
              {error}
              {availableCount
                ? " Previously fetched quotes are marked stale."
                : ""}
            </span>
          )}
          {data && data.status !== "ok" && !error && (
            <span>
              Missing quotes show “Unavailable”; retained quotes show “Stale”
              with their original dates.
            </span>
          )}
          {warnings && (
            <span>
              Some quotes have limited history or older sessions. Open the
              holding for details.
            </span>
          )}
          {performance && (
            <span>
              Simulated purchase: {performance.purchase_date} ·{" "}
              {performance.status === "stale" ? "Stale valuation · " : ""}Price
              returns exclude dividends, fees and taxes.
            </span>
          )}
          {performance?.warnings.map((w) => (
            <span key={w}>{w}</span>
          ))}
          <small>
            Daily bars, not live ticks. Today’s bar is excluded until 16:00 IST;
            the provider may publish later. Volume average excludes the
            displayed session.
          </small>
        </div>
        <button
          className="button secondary"
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh market data"
        >
          <RefreshCw size={14} />
          {loading ? "Loading" : "Refresh"}
        </button>
      </div>
    </>
  );
}
export function QuoteStatus({ quote }: { quote?: Quote }) {
  const { loading } = useMarketData();
  return (
    <small
      className={`quote-status ${quote?.status === "stale" ? "negative" : ""}`}
    >
      {!quote || quote.close === null
        ? loading
          ? "Loading…"
          : "Unavailable"
        : `${quote.status === "stale" ? "Stale · " : ""}${quote.market_date}`}
    </small>
  );
}
export function QuoteVolume({ quote }: { quote?: Quote }) {
  return (
    <small className="quote-volume">
      Vol {volumeText(quote?.volume)}
      {quote?.volume_ratio != null
        ? ` · ${quote.volume_ratio.toFixed(2)}× 20D`
        : " · 20D —"}
    </small>
  );
}

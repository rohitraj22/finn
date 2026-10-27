import type { Performance } from "./performance.ts";
import { portfolioHoldings } from "./portfolio.ts";
// Market prices are nullable by design. A failed request must never fall back to fixtures.
export type Quote = {
  symbol: string;
  yahoo_symbol: string;
  currency: "INR";
  source: "Yahoo Finance via yfinance";
  status: "available" | "stale" | "unavailable";
  close: number | null;
  previous_close: number | null;
  change: number | null;
  change_percent: number | null;
  volume: number | null;
  average_volume_20d: number | null;
  volume_ratio: number | null;
  volume_sessions: number;
  market_date: string | null;
  previous_market_date: string | null;
  session_close_at: string | null;
  fetched_at: string | null;
  warnings: string[];
  error: string | null;
};
export type MarketSnapshot = {
  schema_version: 2;
  performance: Performance;
  source: "Yahoo Finance via yfinance";
  quotes: Quote[];
  status: "ok" | "partial" | "stale" | "unavailable";
  available_count: number;
  requested_count: number;
  latest_market_date: string | null;
  oldest_market_date: string | null;
  last_attempt_at: string;
  next_refresh_at: string;
  cache_hit: boolean;
  timestamp_note: string;
  error: string | null;
};
export function parseSnapshot(value: unknown): MarketSnapshot {
  if (!value || typeof value !== "object")
    throw new Error("Invalid market data response.");
  const data = value as MarketSnapshot;
  if (
    data.schema_version !== 2 ||
    data.source !== "Yahoo Finance via yfinance" ||
    !Array.isArray(data.quotes) ||
    !["ok", "partial", "stale", "unavailable"].includes(data.status) ||
    !Number.isFinite(Date.parse(data.next_refresh_at))
  )
    throw new Error("Invalid market data response.");
  const symbols = new Set<string>();
  for (const q of data.quotes) {
    if (
      !q ||
      typeof q.symbol !== "string" ||
      symbols.has(q.symbol) ||
      q.source !== data.source ||
      q.currency !== "INR" ||
      !["available", "stale", "unavailable"].includes(q.status) ||
      !Array.isArray(q.warnings)
    )
      throw new Error("Invalid quote data.");
    symbols.add(q.symbol);
    for (const field of [
      "close",
      "previous_close",
      "change",
      "change_percent",
      "volume",
      "average_volume_20d",
      "volume_ratio",
    ] as const) {
      if (
        q[field] !== null &&
        (typeof q[field] !== "number" || !Number.isFinite(q[field]))
      )
        throw new Error("Invalid quote value.");
    }
    if (
      q.status !== "unavailable" &&
      (!(q.close! > 0) ||
        !q.market_date ||
        !q.fetched_at ||
        !Number.isFinite(Date.parse(q.fetched_at)))
    )
      throw new Error("Quote is missing its price or date.");
    if (q.status === "unavailable" && q.close !== null)
      throw new Error("Unavailable quote contains a price.");
  }
  const p = data.performance;
  const numeric = (v: unknown) =>
    v === null || (typeof v === "number" && Number.isFinite(v));
  if (
    !p ||
    !Array.isArray(p.positions) ||
    !p.periods ||
    !Array.isArray(p.warnings) ||
    !Number.isFinite(Date.parse(p.fetched_at)) ||
    !["available", "partial", "unavailable", "stale"].includes(p.status) ||
    p.positions.length !== portfolioHoldings.length ||
    new Set(p.positions.map((r) => r.symbol)).size !==
      portfolioHoldings.length ||
    ![
      p.value,
      p.invested,
      p.profit,
      p.return_percent,
      p.day_change,
      p.day_percent,
    ].every(numeric)
  )
    throw new Error("Invalid portfolio performance response.");
  for (const h of portfolioHoldings) {
    const r = p.positions.find((r) => r.symbol === h.symbol);
    if (
      !r ||
      r.quantity !== h.quantity ||
      ![
        r.purchase_price,
        r.invested,
        r.value,
        r.profit,
        r.return_percent,
        r.weight,
      ].every(numeric)
    )
      throw new Error("Invalid holding valuation.");
  }
  for (const period of Object.values(p.periods)) {
    if (
      !period ||
      !Array.isArray(period.points) ||
      !numeric(period.profit) ||
      !numeric(period.return_percent)
    )
      throw new Error("Invalid historical performance.");
    let previous = "";
    for (const point of period.points) {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(point.date) ||
        point.date <= previous ||
        !numeric(point.value) ||
        !Array.isArray(point.missing_symbols)
      )
        throw new Error("Invalid historical price point.");
      previous = point.date;
    }
  }
  return data;
}
export function istTimestamp(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Unavailable";
  return (
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value)) + " IST"
  );
}
export function volumeText(value: number | null | undefined) {
  return value == null
    ? "—"
    : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
        value,
      );
}

/** Preserve stale provenance during retries and expire retained browser data as well. */
export function quoteForDisplay(
  quote: Quote,
  failed: boolean,
  now = Date.now(),
): Quote {
  if (quote.close === null) return quote;
  const expired =
    !quote.fetched_at ||
    now - Date.parse(quote.fetched_at) > 7 * 24 * 60 * 60 * 1000;
  if (expired)
    return {
      ...quote,
      status: "unavailable",
      close: null,
      previous_close: null,
      change: null,
      change_percent: null,
      volume: null,
      average_volume_20d: null,
      volume_ratio: null,
      error: "Retained quote has expired. Refresh market data.",
    };
  return failed ? { ...quote, status: "stale" } : quote;
}

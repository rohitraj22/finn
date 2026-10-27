import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSnapshot, type Quote } from "./market-data.ts";
const quote = (symbol: string, close: number): Quote => ({
  symbol,
  yahoo_symbol: symbol + ".NS",
  source: "Yahoo Finance via yfinance",
  currency: "INR",
  status: "available",
  close,
  previous_close: 100,
  change: close - 100,
  change_percent: close - 100,
  volume: 200,
  average_volume_20d: 100,
  volume_ratio: 2,
  volume_sessions: 20,
  market_date: "2026-10-27",
  previous_market_date: "2026-10-26",
  session_close_at: "2026-10-27T15:30:00+05:30",
  fetched_at: "2026-10-27T18:00:00+05:30",
  warnings: [],
  error: null,
});
test("invalid or mock quote payloads fail validation", () => {
  assert.throws(() => parseSnapshot({ source: "mock", quotes: [] }));
  const payload = {
    schema_version: 2,
    performance: performanceFixture,
    source: "Yahoo Finance via yfinance",
    status: "ok",
    next_refresh_at: "2026-10-27T18:00:00+05:30",
    quotes: [quote("A", 110)],
  };
  assert.equal(parseSnapshot(payload).quotes[0].close, 110);
  assert.throws(() =>
    parseSnapshot({ ...payload, quotes: [{ ...quote("A", 110), close: NaN }] }),
  );
  assert.throws(() =>
    parseSnapshot({ ...payload, quotes: [quote("A", 110), quote("A", 110)] }),
  );
});
import { portfolioHoldings } from "./portfolio.ts";
test("historical simulation preserves all 18 quantities without mock prices or costs", () => {
  assert.equal(portfolioHoldings.length, 18);
  assert.deepEqual(
    portfolioHoldings.map((h) => [h.symbol, h.quantity]),
    [
      ["RELIANCE", 240],
      ["TCS", 80],
      ["HDFCBANK", 200],
      ["INFY", 150],
      ["ICICIBANK", 180],
      ["BHARTIARTL", 100],
      ["LT", 55],
      ["SUNPHARMA", 90],
      ["TITAN", 45],
      ["MARUTI", 12],
      ["ASIANPAINT", 45],
      ["HINDUNILVR", 50],
      ["PERSISTENT", 20],
      ["APLAPOLLO", 60],
      ["POLYCAB", 15],
      ["CDSL", 60],
      ["CERA", 10],
      ["VSTIND", 200],
    ],
  );
  assert.ok(
    portfolioHoldings.every(
      (h) => !("price" in h) && !("change" in h) && !("averageCost" in h),
    ),
  );
});
import { quoteForDisplay } from "./market-data.ts";
test("browser retries retain stale provenance and expire old quotes", () => {
  const q = quote("A", 110);
  const now = Date.parse(q.fetched_at!);
  assert.equal(quoteForDisplay(q, true, now).status, "stale");
  assert.equal(quoteForDisplay(q, true, now).fetched_at, q.fetched_at);
  assert.equal(quoteForDisplay(q, true, now + 8 * 86400000).close, null);
});

import {
  chartSegments,
  performanceForDisplay,
  type Performance,
} from "./performance.ts";
const performanceFixture: Performance = {
  purchase_date: "2025-10-01",
  status: "unavailable",
  fetched_at: "2026-10-27T18:00:00+05:30",
  valuation_date: null,
  invested: null,
  value: null,
  profit: null,
  return_percent: null,
  day_change: null,
  day_percent: null,
  positions: portfolioHoldings.map((h) => ({
    symbol: h.symbol,
    quantity: h.quantity,
    purchase_price: null,
    invested: null,
    value: null,
    profit: null,
    return_percent: null,
    weight: null,
    error: "missing",
  })),
  periods: {},
  warnings: [],
  methodology: "Price return simulation",
};
test("chart gaps split paths instead of fabricating connecting prices", () => {
  const points = [100, null, 120, 130, null, 140].map((value, i) => ({
    date: `2026-10-${20 + i}`,
    value,
    missing_symbols: value === null ? ["TCS"] : [],
  }));
  assert.deepEqual(
    chartSegments(points).map((s) => s.map((p) => p.index)),
    [[0], [2, 3], [5]],
  );
  assert.deepEqual(chartSegments([]), []);
});
test("failed browser refresh labels whole performance stale and expires it", () => {
  const now = Date.parse(performanceFixture.fetched_at);
  assert.equal(
    performanceForDisplay(performanceFixture, true, now)?.status,
    "stale",
  );
  assert.equal(
    performanceForDisplay(performanceFixture, true, now)?.fetched_at,
    performanceFixture.fetched_at,
  );
  assert.equal(
    performanceForDisplay(performanceFixture, false, now + 8 * 86400000),
    null,
  );
});
test("invalid historical numbers and modified quantities are rejected", () => {
  const payload = {
    schema_version: 2,
    source: "Yahoo Finance via yfinance",
    status: "ok",
    next_refresh_at: performanceFixture.fetched_at,
    quotes: [quote("A", 110)],
    performance: performanceFixture,
  };
  assert.throws(() =>
    parseSnapshot({
      ...payload,
      performance: { ...performanceFixture, value: Infinity },
    }),
  );
  assert.throws(() =>
    parseSnapshot({
      ...payload,
      performance: {
        ...performanceFixture,
        positions: performanceFixture.positions.slice(1),
      },
    }),
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseAnnouncements,
  filingsInWindow,
  officialFilingUrl,
  categoryText,
  type Announcement,
  type AnnouncementSnapshot,
} from "./announcements.ts";
import { portfolioHoldings } from "./portfolio.ts";
const now = Date.parse("2026-10-28T06:00:00Z");
const filing = (id: string, hours: number): Announcement => ({
  id,
  symbol: "TCS",
  company_name: "Tata Consultancy Services Limited",
  title: "Financial results",
  description: "Exchange text.",
  source: "NSE",
  source_method: "NSE API",
  filing_url: `https://nsearchives.nseindia.com/corporate/${id}.pdf`,
  published_at: new Date(now - hours * 3600000).toISOString(),
  fetched_at: new Date(now).toISOString(),
  timestamp_basis: "Exchange dissemination time",
  categories: ["results"],
  priority: "High",
  priority_reason: "Keyword rule",
  stale: false,
});
const payload: AnnouncementSnapshot = {
  schema_version: 1,
  status: "ok",
  items: [filing("test", 1)],
  coverage: portfolioHoldings.map((h) => ({
    symbol: h.symbol,
    status: "available",
    detail: "Query succeeded",
    last_success_at: new Date(now).toISOString(),
  })),
  sources: [],
  last_attempt_at: new Date(now).toISOString(),
  next_refresh_at: new Date(now + 600000).toISOString(),
  queried_from: new Date(now - 30 * 86400000).toISOString(),
  queried_to: new Date(now).toISOString(),
  window_start: new Date(now - 30 * 86400000).toISOString(),
  window_end: new Date(now).toISOString(),
  window_hours: 720,
  cache_hit: false,
  error: null,
};
test("24h, 7d and 30d windows are exact, inclusive and newest-first", () => {
  const items = [
    filing("b", 25),
    filing("a", 1),
    filing("c", 24),
    filing("d", 168),
    filing("e", 720),
    filing("future", -1),
  ];
  assert.deepEqual(
    filingsInWindow(items, 24, now).map((a) => a.id),
    ["a", "c"],
  );
  assert.equal(filingsInWindow(items, 168, now).length, 4);
  assert.equal(filingsInWindow(items, 720, now).length, 5);
  assert.equal(items[0].id, "b");
});
test("only official exchange attachment URLs are accepted", () => {
  assert.ok(officialFilingUrl(payload.items[0].filing_url, "NSE"));
  assert.ok(
    officialFilingUrl(
      "https://www.bseindia.com/xml-data/corpfiling/AttachLive/example.pdf",
      "BSE",
    ),
  );
  for (const url of [
    "javascript:alert(1)",
    "http://nsearchives.nseindia.com/corporate/a.pdf",
    "https://nsearchives.nseindia.com.evil.test/corporate/a.pdf",
    "https://me:secret@nsearchives.nseindia.com/corporate/a.pdf",
  ])
    assert.equal(officialFilingUrl(url, "NSE"), false);
  assert.equal(officialFilingUrl(payload.items[0].filing_url, "BSE"), false);
});
test("valid feed can be empty; unavailable and partial statuses stay distinct", () => {
  assert.equal(parseAnnouncements({ ...payload, items: [] }).status, "ok");
  assert.equal(
    parseAnnouncements({ ...payload, status: "unavailable", items: [] }).status,
    "unavailable",
  );
  assert.equal(
    parseAnnouncements({ ...payload, status: "partial" }).status,
    "partial",
  );
});
test("untrusted response rejects bad provenance, timestamps, symbols and duplicate records", () => {
  for (const change of [
    { filing_url: "https://example.com/fake.pdf" },
    { published_at: "2026-10-28" },
    { symbol: "UNKNOWN" },
    { categories: ["invented"] },
    { source: "mock" },
  ])
    assert.throws(() =>
      parseAnnouncements({
        ...payload,
        items: [{ ...filing("test", 1), ...change }],
      }),
    );
  assert.throws(() =>
    parseAnnouncements({
      ...payload,
      items: [filing("test", 1), filing("test", 1)],
    }),
  );
  assert.throws(() =>
    parseAnnouncements({ ...payload, coverage: payload.coverage.slice(1) }),
  );
});
test("expired browser records disappear and rolling boundaries move without refetch", () => {
  const a = filing("old", 24);
  assert.equal(filingsInWindow([a], 24, now).length, 1);
  assert.equal(filingsInWindow([a], 24, now + 1).length, 0);
  assert.equal(
    filingsInWindow(
      [{ ...a, fetched_at: new Date(now - 8 * 86400000).toISOString() }],
      720,
      now,
    ).length,
    0,
  );
});
test("multi-category labels preserve the exchange-text rule matches", () => {
  assert.equal(
    categoryText({ ...filing("test", 1), categories: ["results", "dividend"] }),
    "Results · Dividends",
  );
});

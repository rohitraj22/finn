import categoryLabels from "../data/announcement-categories.json" with { type: "json" };
import { portfolioHoldings } from "./portfolio.ts";
export const announcementCategories = categoryLabels;
export type Category = keyof typeof categoryLabels;
export type FilingInsight = {
  status: "available" | "pending" | "unavailable" | "not_analyzed";
  summary?: string;
  reason?: string;
  categories?: Category[];
  importance?: "High" | "Medium" | "Routine";
  error?: string;
  coverage?: string;
  analyzed_at?: string;
  model?: string;
  evidence?: { page: number | null; text: string; url: string }[];
};
export function importanceOrder(a: Announcement, b: Announcement) {
  const rank = { High: 0, Medium: 1, Routine: 2 };
  return (
    rank[a.priority] - rank[b.priority] ||
    Date.parse(b.published_at) - Date.parse(a.published_at)
  );
}
export type Announcement = {
  insight?: FilingInsight;

  id: string;
  symbol: string;
  company_name: string;
  title: string;
  description: string;
  source: "NSE" | "BSE";
  source_method: "NSE API" | "NSE RSS" | "BSE RSS";
  filing_url: string;
  published_at: string;
  fetched_at: string;
  timestamp_basis: string;
  categories: Category[];
  priority: "High" | "Medium" | "Routine";
  priority_reason: string;
  stale: boolean;
};
export type AnnouncementSnapshot = {
  schema_version: 1;
  status: "ok" | "partial" | "stale" | "unavailable";
  items: Announcement[];
  coverage: {
    symbol: string;
    status: "available" | "partial" | "stale" | "unavailable";
    detail: string;
    last_success_at: string | null;
  }[];
  sources: { source: string; status: string; detail: string; url: string }[];
  last_attempt_at: string;
  next_refresh_at: string;
  queried_from: string;
  queried_to: string;
  window_hours: 24 | 168 | 720;
  window_start: string;
  window_end: string;
  cache_hit: boolean;
  error: string | null;
};
export function officialFilingUrl(value: string, source: string) {
  try {
    const url = new URL(value);
    const hosts =
      source === "NSE"
        ? [
            "nsearchives.nseindia.com",
            "archives.nseindia.com",
            "www.nseindia.com",
          ]
        : source === "BSE"
          ? ["www.bseindia.com", "bseindia.com"]
          : [];
    return (
      url.protocol === "https:" &&
      hosts.includes(url.hostname) &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      url.pathname
        .toLowerCase()
        .startsWith(source === "NSE" ? "/corporate/" : "/xml-data/corpfiling/")
    );
  } catch {
    return false;
  }
}
const dateOK = (value: unknown): value is string =>
  typeof value === "string" &&
  /(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
  Number.isFinite(Date.parse(value));
export function parseAnnouncements(value: unknown): AnnouncementSnapshot {
  if (!value || typeof value !== "object")
    throw new Error("Invalid announcement response.");
  const d = value as AnnouncementSnapshot;
  if (
    d.schema_version !== 1 ||
    !["ok", "partial", "stale", "unavailable"].includes(d.status) ||
    !Array.isArray(d.items) ||
    !Array.isArray(d.coverage) ||
    !Array.isArray(d.sources) ||
    !dateOK(d.last_attempt_at) ||
    !dateOK(d.next_refresh_at) ||
    !dateOK(d.queried_to) ||
    !dateOK(d.queried_from)
  )
    throw new Error("Invalid announcement response.");
  const symbols = new Set(portfolioHoldings.map((h) => h.symbol));
  if (
    d.coverage.length !== symbols.size ||
    new Set(d.coverage.map((c) => c.symbol)).size !== symbols.size ||
    d.coverage.some(
      (c) =>
        !symbols.has(c.symbol) ||
        !["available", "partial", "stale", "unavailable"].includes(c.status) ||
        typeof c.detail !== "string",
    )
  )
    throw new Error("Announcement coverage is incomplete.");
  const ids = new Set();
  for (const a of d.items) {
    if (
      !a ||
      typeof a.id !== "string" ||
      ids.has(a.id) ||
      !symbols.has(a.symbol) ||
      !["NSE", "BSE"].includes(a.source) ||
      !["NSE API", "NSE RSS", "BSE RSS"].includes(a.source_method) ||
      !officialFilingUrl(a.filing_url, a.source) ||
      !dateOK(a.published_at) ||
      !dateOK(a.fetched_at) ||
      !a.title ||
      typeof a.title !== "string" ||
      typeof a.description !== "string" ||
      typeof a.company_name !== "string" ||
      !Array.isArray(a.categories) ||
      !a.categories.length ||
      a.categories.some((c) => !(c in categoryLabels)) ||
      !["High", "Medium", "Routine"].includes(a.priority) ||
      typeof a.priority_reason !== "string" ||
      typeof a.timestamp_basis !== "string" ||
      typeof a.stale !== "boolean"
    )
      throw new Error("Invalid official filing record.");
    ids.add(a.id);
  }
  return d;
}
export function filingsInWindow(
  items: Announcement[],
  hours: number,
  now = Date.now(),
) {
  const cutoff = now - hours * 3600000;
  return items
    .filter(
      (a) =>
        Date.parse(a.published_at) >= cutoff &&
        Date.parse(a.published_at) <= now &&
        now - Date.parse(a.fetched_at) <= 7 * 86400000,
    )
    .sort(
      (a, b) =>
        Date.parse(b.published_at) - Date.parse(a.published_at) ||
        b.id.localeCompare(a.id),
    );
}
export function categoryText(a: Announcement) {
  return a.categories.map((c) => categoryLabels[c]).join(" · ");
}

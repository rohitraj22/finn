"use client";
import { PriceAlerts } from "./price-alerts";
import { useEffect, useState } from "react";
import {
  CheckCheck,
  Check,
  ChevronDown,
  Bell,
  ArrowUpRight,
  Clock3,
  SlidersHorizontal,
} from "lucide-react";
import { portfolioHoldings } from "@/lib/portfolio";
import {
  Announcement,
  importanceOrder,
  announcementCategories,
  categoryText,
  filingsInWindow,
} from "@/lib/announcements";
import { istTimestamp } from "@/lib/market-data";
import { useAlerts } from "./app-shell";
import { useAnnouncements } from "./announcement-data-provider";
import { AnnouncementStatus } from "./announcement-status";
import { FilingInsight } from "./filing-insight";
import { PageHeading, CompanyIcon } from "./ui";
export function AlertsView() {
  const [filter, setFilter] = useState("All updates");
  const [hours, setHours] = useState("24");
  const [category, setCategory] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [limit, setLimit] = useState(25);
  const { readIds, markRead } = useAlerts();
  const { items, data, loading, error, now, analyze } = useAnnouncements();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("category") === "Routine") setFilter("Routine");
    const period = params.get("hours");
    if (period && ["24", "168", "720"].includes(period)) setHours(period);
    const id = window.location.hash.slice(1);
    if (/^(nse|bse)-[a-f0-9]{24}$/.test(id)) {
      setExpanded(id);
      setHours("720");
    }
  }, []);
  const inWindow = filingsInWindow(items, Number(hours), now).sort(
    importanceOrder,
  );
  const visible = inWindow.filter(
    (a) =>
      (category === "all" ||
        a.categories.includes(
          category as keyof typeof announcementCategories,
        )) &&
      (filter === "High priority"
        ? a.priority === "High"
        : filter === "Unread"
          ? !readIds.includes(a.id)
          : filter === "Routine"
            ? a.priority === "Routine"
            : true),
  );
  // A linked filing remains discoverable even when it falls beyond the first page.
  const linkedIndex = expanded
    ? visible.findIndex((a) => a.id === expanded)
    : -1;
  const shown = visible.slice(0, Math.max(limit, linkedIndex + 1));
  const limited = Boolean(error || (data && data.status !== "ok"));
  const pending = loading && !data;
  function resetFilters() {
    setFilter("All updates");
    setCategory("all");
    setHours("720");
    setLimit(25);
  }
  function renderCard(a: Announcement) {
    const read = readIds.includes(a.id);
    return (
      <article
        key={a.id}
        className={`alert-card ${read ? "read" : ""}`}
        id={a.id}
      >
        <div className="alert-card-top">
          <CompanyIcon
            company={portfolioHoldings.find((c) => c.symbol === a.symbol)!}
          />
          <div>
            <strong>{a.company_name}</strong>
            <span>
              {a.symbol} · {categoryText(a)}
            </span>
          </div>
          <span className={`priority-pill ${a.priority.toLowerCase()}`}>
            {a.priority === "High"
              ? "High priority"
              : a.priority === "Medium"
                ? "Medium"
                : "Routine"}{" "}
            · {a.insight?.status === "available" ? "AI" : "Rules"}
          </span>
        </div>
        <div className="alert-text">
          <h3>{a.title}</h3>
          {(a.priority !== "Routine" || expanded === a.id) && (
            <>
              {a.description && (
                <p className="filing-excerpt">
                  <strong>Exchange text:</strong> {a.description}
                </p>
              )}
              <FilingInsight filing={a} />
            </>
          )}
          {a.insight?.status !== "available" && (
            <button
              className="text-button"
              disabled={a.insight?.status === "pending"}
              onClick={() => analyze(a.id)}
            >
              {a.insight?.status === "pending"
                ? "Analyzing…"
                : "Analyze with AI"}
            </button>
          )}
          <a
            className="text-link filing-link"
            href={a.filing_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Original {a.source} filing <ArrowUpRight size={14} />
          </a>
          {expanded === a.id && (
            <div className="alert-detail">
              <strong>Exchange filing details</strong>
              {a.description && <p>{a.description}</p>}
              <p>Rule-based fallback: {a.priority_reason}</p>
              <p>
                {a.timestamp_basis}: {istTimestamp(a.published_at)}. Retrieved
                via {a.source_method}: {istTimestamp(a.fetched_at)}.
              </p>
              {a.stale && (
                <p>
                  Stale cached filing: the source could not be refreshed.
                  Publication time is unchanged.
                </p>
              )}
              <p>
                Exchange facts are shown separately from AI-generated
                interpretation.
              </p>
            </div>
          )}
        </div>
        <div className="alert-bottom">
          <span>
            <Clock3 size={13} />
            <time dateTime={a.published_at}>
              {istTimestamp(a.published_at)}
            </time>
            <i>·</i>
            {a.source}
            {a.stale ? " · Stale" : ""}
          </span>
          <div>
            <button
              className="text-button"
              disabled={read}
              onClick={() => markRead([a.id])}
            >
              {read ? <CheckCheck size={15} /> : <Check size={15} />}
              <span>{read ? "Reviewed" : "Mark reviewed"}</span>
            </button>
            <button
              className="text-button"
              onClick={() => setExpanded(expanded === a.id ? null : a.id)}
              aria-expanded={expanded === a.id}
            >
              {expanded === a.id ? "Less detail" : "View details"}
              <ChevronDown
                size={15}
                style={{
                  transform: expanded === a.id ? "rotate(180deg)" : undefined,
                }}
              />
            </button>
          </div>
        </div>
      </article>
    );
  }
  return (
    <>
      <PageHeading
        eyebrow="SIGNAL OVER NOISE"
        title="What deserves your attention."
        description="Important filings first, with AI insights and original sources."
        action={
          <button
            className="button secondary"
            disabled={!shown.some((a) => !readIds.includes(a.id))}
            onClick={() => markRead(shown.map((a) => a.id))}
          >
            <CheckCheck size={17} />
            Mark visible as reviewed
          </button>
        }
      />
      <PriceAlerts />
      <AnnouncementStatus />
      <div className="alert-overview">
        <div className="alert-overview-icon">
          <Bell size={23} />
        </div>
        <div>
          <h2>
            {pending
              ? "Checking portfolio announcements…"
              : error && !items.length
                ? "Official filings are unavailable"
                : `${inWindow.filter((a) => a.priority === "High").length} priority updates in your portfolio`}
          </h2>
          <p>
            {inWindow.length} retrieved filings in this period · importance
            first
            {limited ? " · incomplete coverage" : ""}
          </p>
        </div>
        <span className="sample-badge">OFFICIAL FILINGS</span>
      </div>
      <div className="alert-toolbar">
        <div className="filter-tabs">
          {["All updates", "High priority", "Unread", "Routine"].map((f) => (
            <button
              key={f}
              className={filter === f ? "selected" : ""}
              aria-pressed={filter === f}
              onClick={() => {
                setFilter(f);
                setLimit(25);
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="filters">
          <label className="select-wrap">
            <SlidersHorizontal size={15} />
            <select
              aria-label="Announcement category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setLimit(25);
              }}
            >
              <option value="all">All categories</option>
              {Object.entries(announcementCategories).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="select-wrap">
            <Clock3 size={15} />
            <select
              aria-label="Digest period"
              value={hours}
              onChange={(e) => {
                setHours(e.target.value);
                setLimit(25);
              }}
            >
              <option value="24">Last 24 hours</option>
              <option value="168">Last 7 days</option>
              <option value="720">Last 30 days</option>
            </select>
          </label>
        </div>
      </div>
      <div className="alerts-layout">
        <div className="alerts-list">
          {shown.map(renderCard)}
          {!visible.length && (
            <div className="panel empty-state">
              <CheckCheck size={30} />
              <h3>
                {pending
                  ? "Loading official filings…"
                  : limited
                    ? "Filings unavailable or coverage incomplete"
                    : "No matching filings"}
              </h3>
              <p>
                {pending
                  ? "Checking the exchanges for your 18 portfolio companies."
                  : limited
                    ? "Some source requests failed or only limited recent feeds were available. This does not confirm that no filings exist."
                    : "No retrieved announcements match these filters. Try a longer period or another category."}
              </p>
              {!pending && (
                <button className="button secondary" onClick={resetFilters}>
                  View all 30 days
                </button>
              )}
            </div>
          )}
          {visible.length > shown.length && (
            <button
              className="routine-toggle"
              onClick={() => setLimit((n) => n + 25)}
            >
              <ChevronDown size={16} />
              Showing {shown.length} of {visible.length} filings
              <span>Load more</span>
            </button>
          )}
        </div>
        <aside className="panel digest-note">
          <div className="eyebrow">A MORE CONSIDERED FEED</div>
          <h2>Important is personal.</h2>
          <p>
            AI evaluates selected original filings for significance. Unanalyzed
            or unavailable items retain rule-based labels. Routine cards are
            collapsed.
          </p>
          <div>
            <i className="priority-dot high" />
            <span>
              <strong>High priority</strong>Results, management, M&A, capex,
              fundraising and legal matters.
            </span>
          </div>
          <div>
            <i className="priority-dot medium" />
            <span>
              <strong>Worth a look</strong>Dividends, calls, ratings, business
              updates and unmatched filings.
            </span>
          </div>
          <div>
            <i className="priority-dot routine" />
            <span>
              <strong>Routine</strong>Meetings, shareholder notices and
              administrative filings.
            </span>
          </div>
          <p className="digest-disclaimer">
            AI insights are interpretations, not verified financial facts or
            investment advice. Up to 12 recent filings are automatically
            selected daily; analyze other filings on demand.
          </p>
        </aside>
      </div>
    </>
  );
}

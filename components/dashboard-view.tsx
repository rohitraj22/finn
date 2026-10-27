"use client";
import { PriceAlerts } from "./price-alerts";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Sparkles,
  Layers3,
  Bell,
  CircleCheck,
  CalendarDays,
} from "lucide-react";
import { companies, portfolioHoldings, money } from "@/lib/mock-data";
import { PageHeading, Change, CompanyIcon, SectionLink } from "@/components/ui";
import { PerformanceChart } from "@/components/performance-chart";
import { FinnMark } from "@/components/app-shell";
import { useMarketData } from "./market-data-provider";
import { MarketStatus, QuoteStatus, QuoteVolume } from "./market-status";

import { useAnnouncements } from "./announcement-data-provider";
import { AnnouncementStatus } from "./announcement-status";
import {
  filingsInWindow,
  importanceOrder,
  categoryText,
} from "@/lib/announcements";
import { istTimestamp } from "@/lib/market-data";
export function DashboardView() {
  const announcements = useAnnouncements();
  const recentFilings = filingsInWindow(
    announcements.items,
    24,
    announcements.now,
  );
  const radar = [...recentFilings].sort(importanceOrder).slice(0, 3);
  const { quotes, data, loading, performance } = useMarketData();
  const totals =
    performance?.value != null
      ? {
          value: performance.value,
          change: performance.day_change,
          changePercent: performance.day_percent,
        }
      : null;
  const positions = Object.fromEntries(
    (performance?.positions || []).map((p) => [p.symbol, p]),
  );
  const totalReturn = performance?.profit;
  const investedValue = performance?.invested;
  const displayMoney = (value: number | null | undefined) =>
    value != null ? money(value, 2) : loading ? "Loading…" : "Unavailable";
  const topMovers = portfolioHoldings
    .filter(
      (c) =>
        quotes[c.symbol]?.change_percent != null &&
        quotes[c.symbol]?.market_date === data?.latest_market_date &&
        quotes[c.symbol]?.status === "available",
    )
    .sort(
      (a, b) =>
        quotes[b.symbol].change_percent! - quotes[a.symbol].change_percent!,
    )
    .slice(0, 4);
  const allocation = Object.entries(
    portfolioHoldings.reduce<Record<string, number>>((all, c) => {
      all[c.sector] = (all[c.sector] || 0) + (positions[c.symbol]?.value ?? 0);
      return all;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const mainAllocation = [
    ...allocation.slice(0, 3),
    [
      "Other sectors",
      allocation.slice(3).reduce((sum, a) => sum + a[1], 0),
    ] as [string, number],
  ];
  const colors = ["#248773", "#95bbae", "#b9c8d1", "#e1e8e4"];
  let cursor = 0;
  const gradient = mainAllocation
    .map(([, v], i) => {
      const start = cursor;
      cursor += (v / (totals?.value || 1)) * 100;
      return `${colors[i]} ${start}% ${cursor}%`;
    })
    .join(",");
  return (
    <>
      <PageHeading
        eyebrow="YOUR DAILY PERSPECTIVE"
        title="A clearer view of your investments."
        description="Your portfolio, the updates that matter, and room to think ahead."
        action={
          <div className="date-label">
            <CalendarDays size={16} />
            {data?.latest_market_date || "Awaiting market data"}
            <span>Latest fetched session</span>
          </div>
        }
      />
      <MarketStatus />
      <div className="stats-grid">
        <section className="stat-card primary-stat">
          <div className="stat-label">
            Portfolio value <Layers3 size={17} />
          </div>
          <strong>
            {totals
              ? money(totals.value, 2)
              : loading
                ? "Loading…"
                : "Unavailable"}
          </strong>
          <div>
            <span
              className={
                totals?.change != null && totals.change < 0
                  ? "negative"
                  : "stat-positive"
              }
            >
              {totals?.change != null && totals.change < 0 ? (
                <ArrowDownRight size={14} />
              ) : (
                <ArrowUpRight size={14} />
              )}
              {totals?.change != null && totals.changePercent != null
                ? `${money(totals.change, 2)} (${totals.changePercent.toFixed(2)}%)`
                : "Daily change unavailable"}
            </span>
            <span> latest session</span>
          </div>
        </section>
        <section className="stat-card">
          <div className="stat-label">
            Since purchase <ArrowUpRight size={18} />
          </div>
          <strong
            className={
              totalReturn != null && totalReturn < 0 ? "negative" : "positive"
            }
          >
            {displayMoney(totalReturn)}
          </strong>
          <div>
            <span
              className={
                totalReturn != null && totalReturn < 0 ? "negative" : "positive"
              }
            >
              {performance?.return_percent != null
                ? `${performance.return_percent >= 0 ? "+" : ""}${performance.return_percent.toFixed(2)}%`
                : "—"}
            </span>
            <span> on {displayMoney(investedValue)} invested</span>
          </div>
        </section>
        <section className="stat-card">
          <div className="stat-label">
            Your portfolio <Layers3 size={18} />
          </div>
          <strong>
            18 <small>companies</small>
          </strong>
          <div>
            <span className="subtle-dot" />
            Across {allocation.length} sectors
          </div>
        </section>
        <Link className="stat-card alert-stat" href="/alerts">
          <div className="stat-label">
            Corporate filings <Bell size={17} />
          </div>
          <strong>
            {announcements.loading && !announcements.data
              ? "…"
              : announcements.error && !announcements.items.length
                ? "—"
                : recentFilings.length}{" "}
            <small>in last 24 hours</small>
          </strong>
          <div>
            See what changed <ArrowRight size={15} />
          </div>
        </Link>
      </div>
      <div className="dashboard-grid">
        <PerformanceChart />
        <section className="panel allocation-panel">
          <div className="panel-heading">
            <div>
              <h2>Portfolio mix</h2>
              <p>By current market value</p>
            </div>
          </div>
          <div
            className="donut"
            style={{
              background: totals ? `conic-gradient(${gradient})` : "#e1e8e4",
            }}
            role="img"
            aria-label={
              !totals
                ? "Allocation unavailable"
                : mainAllocation
                    .map(
                      ([n, v]) =>
                        `${n}: ${((v / (totals?.value || 1)) * 100).toFixed(1)}%`,
                    )
                    .join(", ")
            }
          >
            <div>
              <span>INVESTED IN</span>
              <strong>{allocation.length}</strong>
              <span>sectors</span>
            </div>
          </div>
          <div className="allocation-legend">
            {mainAllocation.map(([name, value], i) => (
              <div key={name}>
                <span style={{ background: colors[i] }} />
                <span>{name}</span>
                <strong>
                  {totals
                    ? `${((value / totals.value) * 100).toFixed(1)}%`
                    : "—"}
                </strong>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="dashboard-grid lower-grid">
        <section className="panel updates-panel">
          <div className="panel-heading">
            <div>
              <div className="heading-with-dot">
                <h2>On your radar</h2>
                <span className="count-badge">{recentFilings.length}</span>
              </div>
              <p>Latest official filings · last 24 hours</p>
            </div>
            <SectionLink href="/alerts">All updates</SectionLink>
          </div>
          <PriceAlerts compact />
          <AnnouncementStatus compact />
          <div className="radar-list">
            {radar.map((a) => (
              <Link href={`/alerts#${a.id}`} className="radar-item" key={a.id}>
                <CompanyIcon
                  company={companies.find((c) => c.symbol === a.symbol)!}
                />
                <div className="radar-body">
                  <div className="radar-meta">
                    <strong>{a.symbol}</strong>
                    <span>{categoryText(a)}</span>
                    <span>{istTimestamp(a.published_at)}</span>
                  </div>
                  <h3>{a.title}</h3>
                  {a.insight?.status === "available" && (
                    <p className="radar-ai">AI insight: {a.insight.summary}</p>
                  )}
                  <p>
                    {a.source} · {a.priority} priority ·{" "}
                    {a.insight?.status === "available" ? "AI" : "Rules"}
                    {a.stale ? " · Stale cached filing" : ""}
                  </p>
                </div>
                <ArrowUpRight size={17} />
              </Link>
            ))}
            {!radar.length && (
              <p className="market-empty">
                {announcements.loading
                  ? "Loading exchange filings…"
                  : announcements.error || announcements.data?.status !== "ok"
                    ? "Recent filings are unavailable or coverage is incomplete."
                    : "No filings returned for these companies in the last 24 hours."}
              </p>
            )}
          </div>
          <div className="panel-footnote">
            <CircleCheck size={14} />
            Importance first · AI insights where available; rule-based fallback.
            <Link href="/alerts?hours=720">View 30 days</Link>
          </div>
        </section>
        <section className="research-promo">
          <div className="promo-top">
            <FinnMark small />
            <span>THE RESEARCH ROOM</span>
            <Sparkles size={18} />
          </div>
          <h2>
            Good questions.
            <br />
            Better perspective.
          </h2>
          <p>Make room for a deeper look into the companies you follow.</p>
          <Link
            href="/research?company=TCS&topic=cash"
            className="sample-question"
          >
            Do TCS’s profits turn into cash?
            <ArrowUpRight size={17} />
          </Link>
          <Link href="/research" className="promo-cta">
            Explore AI Research <ArrowRight size={17} />
          </Link>
          <div className="promo-disclaimer">
            Preview workspace · AI integration coming later
          </div>
        </section>
      </div>
      <section className="panel movers-panel">
        <div className="panel-heading">
          <div>
            <h2>Latest session movers</h2>
            <p>Fetched daily changes · volume vs. previous 20 sessions</p>
          </div>
          <SectionLink href="/portfolio">View portfolio</SectionLink>
        </div>
        <div className="movers-grid">
          {topMovers.map((c) => (
            <Link
              href={`/portfolio?company=${c.symbol}`}
              key={c.symbol}
              className="mover"
            >
              <div>
                <CompanyIcon company={c} />
                <div>
                  <strong>{c.symbol}</strong>
                  <small>{c.name}</small>
                </div>
              </div>
              <div>
                <strong>{money(quotes[c.symbol].close!, 2)}</strong>
                <Change value={quotes[c.symbol].change_percent!} />
              </div>
              <QuoteVolume quote={quotes[c.symbol]} />
              <QuoteStatus quote={quotes[c.symbol]} />
            </Link>
          ))}
          {topMovers.length === 0 && (
            <p className="market-empty">
              {loading
                ? "Loading market movers…"
                : "No current-session movers available. Mock prices are never used as a fallback."}
            </p>
          )}
        </div>
      </section>
    </>
  );
}

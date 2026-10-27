"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Search,
  ArrowUpDown,
  X,
  ArrowUpRight,
  PieChart,
  SlidersHorizontal,
} from "lucide-react";
import { portfolioHoldings, sectors, money, Holding } from "@/lib/mock-data";
import { PageHeading, CompanyIcon, Change } from "./ui";
import { useMarketData } from "./market-data-provider";
import { MarketStatus, QuoteStatus, QuoteVolume } from "./market-status";
import { istTimestamp, volumeText } from "@/lib/market-data";
export function PortfolioView() {
  const { quotes, loading, performance } = useMarketData();
  const totals =
    performance?.value != null ? { value: performance.value } : null;
  const positions = Object.fromEntries(
    (performance?.positions || []).map((p) => [p.symbol, p]),
  );
  const totalReturn = performance?.profit;
  const investedValue = performance?.invested;
  const displayMoney = (value: number | null | undefined) =>
    value != null ? money(value, 2) : loading ? "Loading…" : "Unavailable";
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("All sectors");
  const [sort, setSort] = useState("value");
  const [selected, setSelected] = useState<Holding | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const symbol = new URLSearchParams(window.location.search).get("company");
    if (symbol)
      setSelected(portfolioHoldings.find((c) => c.symbol === symbol) || null);
  }, []);
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
  }, [selected]);
  const selectedPosition = selected ? positions[selected.symbol] : undefined;
  const selectedQuote = selected ? quotes[selected.symbol] : undefined;
  const filtered = portfolioHoldings
    .filter(
      (c) =>
        (sector === "All sectors" || c.sector === sector) &&
        `${c.name} ${c.symbol}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "value"
        ? (quotes[b.symbol]?.close ?? -1) * b.quantity -
          (quotes[a.symbol]?.close ?? -1) * a.quantity
        : sort === "change"
          ? (quotes[b.symbol]?.change_percent ?? -Infinity) -
            (quotes[a.symbol]?.change_percent ?? -Infinity)
          : a.name.localeCompare(b.name),
    );
  function close() {
    dialog.current?.close();
    setSelected(null);
  }
  return (
    <>
      <PageHeading
        eyebrow="THE BIG PICTURE"
        title="Your portfolio."
        description="18 companies. Different stories. One considered perspective."
      />
      <MarketStatus />
      <div className="portfolio-summary">
        <div>
          <span>Portfolio value</span>
          <strong>
            {totals
              ? money(totals.value, 2)
              : loading
                ? "Loading…"
                : "Unavailable"}
          </strong>
          {!totals && !loading && (
            <small>Requires 18 prices from the same session</small>
          )}
        </div>
        <div>
          <span>Simulated invested capital</span>
          <strong>{displayMoney(investedValue)}</strong>
        </div>
        <div>
          <span>Since purchase</span>
          <strong
            className={
              totalReturn != null && totalReturn < 0 ? "negative" : "positive"
            }
          >
            {displayMoney(totalReturn)}
            <small>
              {" "}
              (
              {performance?.return_percent != null
                ? `${performance.return_percent.toFixed(2)}%`
                : "—"}
              )
            </small>
          </strong>
        </div>
        <PieChart size={36} />
      </div>
      <section className="panel">
        <div className="portfolio-toolbar">
          <div>
            <h2>
              All holdings <span className="count-badge">18</span>
            </h2>
            <p>
              Hypothetical shares · purchased at the{" "}
              {performance?.purchase_date || "2025-10-01"} historical close
            </p>
          </div>
          <div className="filters">
            <label className="search-input">
              <Search size={17} />
              <input
                aria-label="Search companies"
                placeholder="Search name or symbol…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button aria-label="Clear search" onClick={() => setSearch("")}>
                  <X size={15} />
                </button>
              )}
            </label>
            <label className="select-wrap">
              <SlidersHorizontal size={15} />
              <select
                aria-label="Filter by sector"
                value={sector}
                onChange={(e) => setSector(e.target.value)}
              >
                <option>All sectors</option>
                {sectors.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="select-wrap">
              <ArrowUpDown size={15} />
              <select
                aria-label="Sort holdings"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="value">Holding value</option>
                <option value="change">Day’s change</option>
                <option value="name">Company name</option>
              </select>
            </label>
          </div>
        </div>
        <div className="holdings-table">
          <div className="holdings-row table-header">
            <span>COMPANY</span>
            <span>EOD PRICE / CHANGE / VOLUME</span>
            <span>HOLDING VALUE</span>
            <span>SINCE PURCHASE</span>
            <span>WEIGHT</span>
            <span />
          </div>
          {filtered.map((c) => {
            const q = quotes[c.symbol];
            const position = positions[c.symbol];
            const gain = position?.return_percent;
            return (
              <button
                className="holdings-row"
                key={c.symbol}
                onClick={() => setSelected(c)}
                aria-label={`View ${c.name} holding`}
              >
                <span className="company-cell">
                  <CompanyIcon company={c} />
                  <span>
                    <strong>{c.name}</strong>
                    <small>
                      {c.symbol} <i>·</i> {c.sector}
                    </small>
                  </span>
                </span>
                <span className="price-cell">
                  <strong>{q?.close != null ? money(q.close, 2) : "—"}</strong>
                  {q?.change_percent != null ? (
                    <Change value={q.change_percent} />
                  ) : (
                    <small>Day change —</small>
                  )}
                  <QuoteVolume quote={q} />
                  <QuoteStatus quote={q} />
                </span>
                <span className="holding-cell">
                  <strong>
                    {position?.value != null ? money(position.value, 2) : "—"}
                  </strong>
                  <small>{c.quantity} shares</small>
                </span>
                <span className="return-cell">
                  <strong
                    className={
                      gain != null && gain >= 0 ? "positive" : "negative"
                    }
                  >
                    {position?.profit != null ? money(position.profit, 2) : "—"}
                  </strong>
                  <small
                    className={
                      gain != null && gain >= 0 ? "positive" : "negative"
                    }
                  >
                    {gain != null && gain >= 0 ? "+" : ""}
                    {gain != null
                      ? `${gain.toFixed(2)}%`
                      : "History unavailable"}
                  </small>
                </span>
                <span className="weight-cell">
                  {position?.weight != null
                    ? `${position.weight.toFixed(2)}%`
                    : "—"}
                  <span className="weight-bar">
                    <i
                      style={{
                        width: `${Math.min(100, (position?.weight ?? 0) * 6.5)}%`,
                      }}
                    />
                  </span>
                </span>
                <ArrowUpRight className="row-arrow" size={17} />
              </button>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="empty-state">
            <Search size={28} />
            <h3>No companies found</h3>
            <p>Try another symbol or choose a different sector.</p>
            <button
              className="button secondary"
              onClick={() => {
                setSearch("");
                setSector("All sectors");
              }}
            >
              Reset filters
            </button>
          </div>
        )}
        <div className="table-footer" aria-live="polite">
          Showing {filtered.length} of 18 holdings
          <span>Yahoo EOD prices · INR · Fictional holdings</span>
        </div>
      </section>
      <dialog
        ref={dialog}
        className="company-dialog"
        aria-labelledby="holding-title"
        onCancel={close}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        {selected && (
          <>
            <div className="dialog-header">
              <span className="eyebrow">EOD QUOTE · DEMO HOLDING</span>
              <button
                className="icon-button"
                onClick={close}
                aria-label="Close holding details"
              >
                <X size={21} />
              </button>
            </div>
            <CompanyIcon company={selected} />
            <h2 id="holding-title">{selected.name}</h2>
            <p>
              {selected.symbol} · NSE · {selected.sector}
            </p>
            <div className="detail-price">
              {selectedQuote?.close != null
                ? money(selectedQuote.close, 2)
                : "Unavailable"}{" "}
              {selectedQuote?.change_percent != null && (
                <Change value={selectedQuote.change_percent} />
              )}
            </div>
            <dl className="detail-grid">
              <div>
                <dt>Shares held</dt>
                <dd>{selected.quantity}</dd>
              </div>
              <div>
                <dt>
                  Purchase close · {performance?.purchase_date || "2025-10-01"}
                </dt>
                <dd>{displayMoney(selectedPosition?.purchase_price)}</dd>
              </div>
              <div>
                <dt>Holding value</dt>
                <dd>{displayMoney(selectedPosition?.value)}</dd>
              </div>
              <div>
                <dt>Portfolio weight</dt>
                <dd>
                  {selectedPosition?.weight != null
                    ? `${selectedPosition.weight.toFixed(2)}%`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Simulated profit / loss</dt>
                <dd>
                  {displayMoney(selectedPosition?.profit)}
                  {selectedPosition?.return_percent != null && (
                    <small>
                      {" "}
                      ({selectedPosition.return_percent.toFixed(2)}%)
                    </small>
                  )}
                </dd>
              </div>
              <div>
                <dt>Illustrative size band</dt>
                <dd>{selected.size}</dd>
              </div>
              <div>
                <dt>Session volume</dt>
                <dd>{volumeText(selectedQuote?.volume)}</dd>
              </div>
              <div>
                <dt>Previous 20-session average</dt>
                <dd>{volumeText(selectedQuote?.average_volume_20d)}</dd>
              </div>
              <div>
                <dt>Volume / 20-session average</dt>
                <dd>
                  {selectedQuote?.volume_ratio != null
                    ? `${selectedQuote.volume_ratio.toFixed(2)}×`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Daily price change</dt>
                <dd>
                  {selectedQuote?.change != null
                    ? money(selectedQuote.change, 2)
                    : "—"}
                </dd>
              </div>
            </dl>
            <div className="detail-note">
              <QuoteStatus quote={selectedQuote} />
              <br />
              Scheduled session close:{" "}
              {istTimestamp(selectedQuote?.session_close_at)}
              <br />
              Fetched: {istTimestamp(selectedQuote?.fetched_at)}
              <br />
              Source: Yahoo Finance via yfinance · Daily close, split adjusted;
              dividends excluded.
              {selectedQuote?.error && <p>{selectedQuote.error}</p>}
              {selectedQuote?.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
            <div className="detail-note">
              {selectedPosition?.error && <p>{selectedPosition.error}</p>}
              Invested capital: {displayMoney(selectedPosition?.invested)}.{" "}
              {performance?.methodology}
            </div>
            <Link
              className="button primary full-width"
              href={`/research?company=${selected.symbol}`}
            >
              Explore in AI Research <ArrowUpRight size={17} />
            </Link>
          </>
        )}
      </dialog>
    </>
  );
}

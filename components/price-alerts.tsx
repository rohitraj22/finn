"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMarketData } from "./market-data-provider";
import { portfolioHoldings, money } from "@/lib/mock-data";
type Settings = {
  price_up_percent: number;
  price_down_percent: number;
  volume_multiple: number;
};
type Signal = {
  id: string;
  symbol: string;
  condition: string;
  session: string;
  title: string;
  actual: number;
  threshold: number;
  close: number;
  previous_close: number;
  volume: number;
  average_volume_20d: number;
  reason: string;
};
type Feed = {
  settings: Settings;
  items: Signal[];
  session: string | null;
  checked_companies: number;
  incomplete_companies: string[];
  note: string;
};
export function PriceAlerts({ compact = false }: { compact?: boolean }) {
  const { data: market } = useMarketData();
  const [data, setData] = useState<Feed | null>(null),
    [draft, setDraft] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setError(null);
    fetch("/api/price-alerts", { signal: c.signal, cache: "no-store" })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok)
          throw Error(
            typeof body.detail === "string"
              ? body.detail
              : "Unable to load EOD alerts.",
          );
        if (!c.signal.aborted) {
          setData(body);
          setDraft(body.settings);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message);
          setData(null);
        }
      });
    return () => c.abort();
  }, [market?.last_attempt_at, version]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/price-alerts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!r.ok)
        throw Error(
          "Could not save settings. Enter valid positive thresholds and retry.",
        );
      setMessage("Settings saved. Checking the latest available session…");
      setVersion((v) => v + 1);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel eod-alerts"
      aria-label="End-of-day price and volume alerts"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">PRICE & VOLUME · RULE-BASED</span>
          <h2>End-of-day alerts</h2>
        </div>
        {compact && (
          <Link className="text-link" href="/alerts#alert-settings">
            Alert settings
          </Link>
        )}
      </div>
      <p>
        {data?.session
          ? `Latest available completed session: ${data.session}`
          : "Completed-session data unavailable or loading."}{" "}
        · Not real-time monitoring.
      </p>
      {!compact && (
        <details id="alert-settings">
          <summary>Alert settings</summary>
          {draft && (
            <form onSubmit={save}>
              <div className="eod-settings">
                {(
                  [
                    ["price_up_percent", "Daily increase (%)", 1000],
                    ["price_down_percent", "Daily decrease (%)", 100],
                    [
                      "volume_multiple",
                      "Volume / previous 20-day average (×)",
                      1000,
                    ],
                  ] as const
                ).map(([key, label, max]) => (
                  <label key={key}>
                    {label}
                    <input
                      required
                      type="number"
                      min="0.01"
                      max={max}
                      step="0.01"
                      value={draft[key]}
                      onChange={(e) =>
                        setDraft({ ...draft, [key]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
              </div>
              <button className="button secondary" disabled={busy}>
                {busy ? "Saving…" : "Save thresholds"}
              </button>
              <p>
                Applies to all 18 demo holdings. Saving rechecks this session;
                alert identities remain unchanged.
              </p>
            </form>
          )}
        </details>
      )}
      <p role="status">{message}</p>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button
            className="text-button"
            onClick={() => setVersion((v) => v + 1)}
          >
            Retry
          </button>
        </p>
      ) : !data ? (
        <p>Checking EOD conditions…</p>
      ) : (
        <>
          <small>
            {data.checked_companies}/18 companies have quotes for this session.{" "}
            {data.incomplete_companies.length > 0
              ? `Some conditions could not be evaluated: ${data.incomplete_companies.join(", ")}.`
              : ""}
          </small>
          {data.items.length === 0 && (
            <p>
              No threshold crossings in the usable data. This does not confirm
              conditions for missing quotes.
            </p>
          )}
          {data.items.slice(0, compact ? 3 : undefined).map((a) => (
            <article className="eod-signal" key={a.id}>
              <strong>
                {portfolioHoldings.find((c) => c.symbol === a.symbol)?.name ||
                  a.symbol}{" "}
                · {a.title}
              </strong>
              <p>
                {a.condition === "volume"
                  ? `${a.actual.toFixed(2)}× volume, above ${a.threshold}× · ${a.volume.toLocaleString("en-IN")} shares vs ${a.average_volume_20d.toLocaleString("en-IN", { maximumFractionDigits: 0 })} previous-20-session average`
                  : `${a.actual > 0 ? "+" : ""}${a.actual.toFixed(2)}% daily move, beyond ${a.threshold > 0 ? "+" : ""}${a.threshold}% · ${money(a.previous_close, 2)} → ${money(a.close, 2)}`}
              </p>
              <small>
                Session {a.session} · {a.symbol}
              </small>
              <p>{a.reason}</p>
            </article>
          ))}
          {compact && data.items.length > 3 && (
            <Link className="text-link" href="/alerts">
              View all {data.items.length} EOD alerts
            </Link>
          )}
        </>
      )}
    </section>
  );
}

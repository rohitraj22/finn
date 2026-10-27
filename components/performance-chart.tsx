"use client";
import { useId, useState } from "react";
import { money } from "@/lib/mock-data";
import { chartSegments } from "@/lib/performance";
import { useMarketData } from "./market-data-provider";
const periods = ["1W", "1M", "3M", "1Y"] as const;
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(date));
export function PerformanceChart() {
  const [period, setPeriod] = useState<(typeof periods)[number]>("1M");
  const id = useId().replaceAll(":", "");
  const { performance, loading } = useMarketData();
  const data = performance?.periods[period];
  const points = data?.points || [];
  const values = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const padding = Math.max((max - min) * 0.15, max * 0.001, 1);
  const domainMin = min - padding;
  const domainMax = max + padding;
  const y = (value: number) =>
    185 - ((value - domainMin) / (domainMax - domainMin)) * 150;
  const x = (index: number) =>
    points.length > 1 ? (index / (points.length - 1)) * 720 : 360;
  const segments = chartSegments(points);
  const labelIndices = Array.from(
    new Set(
      Array.from({ length: Math.min(4, points.length) }, (_, i) =>
        Math.round(
          (i * (points.length - 1)) /
            Math.max(1, Math.min(4, points.length) - 1),
        ),
      ),
    ),
  );
  const profit = data?.profit;
  return (
    <section className="panel performance-panel">
      <div className="panel-heading">
        <div>
          <h2>Portfolio performance</h2>
          <p>Historical closes × hypothetical shares</p>
        </div>
        <div className="period-tabs" aria-label="Chart period">
          {periods.map((p) => (
            <button
              key={p}
              aria-pressed={p === period}
              className={p === period ? "selected" : ""}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-summary" aria-live="polite">
        <strong
          className={profit != null && profit < 0 ? "negative" : "positive"}
        >
          {profit != null
            ? `${profit >= 0 ? "+" : ""}${money(profit, 2)}`
            : loading
              ? "Loading…"
              : "Unavailable"}
        </strong>
        {data?.return_percent != null && (
          <span className={`gain-pill ${profit! < 0 ? "negative" : ""}`}>
            {data.return_percent >= 0 ? "+" : ""}
            {data.return_percent.toFixed(2)}%
          </span>
        )}
        <span>simulated {period} price return</span>
      </div>
      {values.length ? (
        <>
          <div className="chart-wrap">
            <div className="y-axis">
              {[domainMax, (domainMin + domainMax) / 2, domainMin].map((n) => (
                <span key={n}>₹{(n / 100000).toFixed(2)}L</span>
              ))}
            </div>
            <svg
              className="performance-chart"
              viewBox="0 0 720 210"
              role="img"
              aria-label={`Simulated ${period} portfolio value, ${data?.start_date} to ${data?.end_date}. Ending value ${points.at(-1)?.value != null ? money(points.at(-1)!.value!, 2) : "unavailable"}. ${data?.missing_sessions || 0} missing sessions shown as gaps.`}
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#208771" stopOpacity=".19" />
                  <stop offset="100%" stopColor="#208771" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[35, 110, 185].map((y) => (
                <line
                  key={y}
                  x1="0"
                  y1={y}
                  x2="720"
                  y2={y}
                  stroke="#e7ece9"
                  strokeDasharray="4 5"
                />
              ))}
              {segments.map((segment, i) => {
                const coords = segment
                  .map(({ point, index }) => `${x(index)},${y(point.value)}`)
                  .join(" ");
                return (
                  <g key={i}>
                    <polygon
                      points={`${x(segment[0].index)},210 ${coords} ${x(segment.at(-1)!.index)},210`}
                      fill={`url(#${id})`}
                    />
                    <polyline
                      points={coords}
                      fill="none"
                      stroke="#218772"
                      strokeWidth="2.8"
                      vectorEffect="non-scaling-stroke"
                      strokeLinejoin="round"
                    />
                    {segment.length === 1 && (
                      <circle
                        cx={x(segment[0].index)}
                        cy={y(segment[0].point.value)}
                        r="3"
                        fill="#218772"
                      />
                    )}
                    {segment.map(({ point, index }) => (
                      <circle
                        key={point.date}
                        cx={x(index)}
                        cy={y(point.value)}
                        r="5"
                        fill="transparent"
                      >
                        <title>
                          {point.date}: {money(point.value, 2)}
                        </title>
                      </circle>
                    ))}
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="x-axis">
            {labelIndices.map((i) => (
              <span key={points[i].date}>{dateLabel(points[i].date)}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <p>
            {loading
              ? "Loading historical prices…"
              : "Historical valuations are unavailable. No estimated history is shown."}
          </p>
        </div>
      )}
      <div className="chart-legend">
        <span />
        <span>Portfolio value</span>
        <small>
          {performance?.status === "stale" ? "Stale · " : ""}
          {data?.start_date && `${data.start_date} – ${data.end_date}`}
        </small>
      </div>
      {data?.error && <p className="market-empty">{data.error}</p>}
      {!!data?.missing_sessions && (
        <p className="market-empty">
          {data.missing_sessions} session(s) have missing prices and appear as
          gaps. No prices are filled in.
        </p>
      )}
    </section>
  );
}

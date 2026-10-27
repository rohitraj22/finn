export type Position = {
  symbol: string;
  quantity: number;
  purchase_price: number | null;
  invested: number | null;
  value: number | null;
  profit: number | null;
  return_percent: number | null;
  weight: number | null;
  error: string | null;
};
export type HistoryPoint = {
  date: string;
  value: number | null;
  missing_symbols: string[];
};
export type ChartPeriod = {
  requested_start: string;
  start_date: string | null;
  end_date: string | null;
  points: HistoryPoint[];
  profit: number | null;
  return_percent: number | null;
  missing_sessions: number;
  error: string | null;
};
export type Performance = {
  purchase_date: string;
  status: "available" | "partial" | "unavailable" | "stale";
  fetched_at: string;
  valuation_date: string | null;
  invested: number | null;
  value: number | null;
  profit: number | null;
  return_percent: number | null;
  day_change: number | null;
  day_percent: number | null;
  positions: Position[];
  periods: Partial<Record<"1W" | "1M" | "3M" | "1Y", ChartPeriod>>;
  warnings: string[];
  methodology: string;
};

export function performanceForDisplay(
  p: Performance | undefined,
  failed: boolean,
  now = Date.now(),
): Performance | null {
  if (!p || now - Date.parse(p.fetched_at) > 7 * 86400000) return null;
  return failed ? { ...p, status: "stale" } : p;
}

/** Missing observations break the line: never interpolate over unavailable closes. */
export function chartSegments(points: HistoryPoint[]) {
  const segments: {
    point: HistoryPoint & { value: number };
    index: number;
  }[][] = [];
  let segment: (typeof segments)[number] = [];
  points.forEach((point, index) => {
    if (point.value === null) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push({ point: { ...point, value: point.value }, index });
  });
  if (segment.length) segments.push(segment);
  return segments;
}

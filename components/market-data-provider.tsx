"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  MarketSnapshot,
  Quote,
  parseSnapshot,
  quoteForDisplay,
} from "@/lib/market-data";
import { performanceForDisplay, type Performance } from "@/lib/performance";
type MarketState = {
  performance: Performance | null;
  data: MarketSnapshot | null;
  quotes: Record<string, Quote>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};
const Context = createContext<MarketState | null>(null);
export function MarketDataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [data, setData] = useState<MarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 100_000);
    setLoading(true);
    try {
      const response = await fetch("/api/market", {
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok && body.schema_version !== 2)
        throw new Error(body.error || "Market data is unavailable.");
      const snapshot = parseSnapshot(body);
      setData(snapshot);
      setError(
        snapshot.status === "unavailable"
          ? "Yahoo Finance returned no usable prices. Try again after the retry time below."
          : null,
      );
    } catch (e) {
      if (active.current === controller)
        setError(
          e instanceof Error && e.name !== "AbortError"
            ? e.message
            : "Market request timed out. Please retry.",
        );
    } finally {
      clearTimeout(timeout);
      if (active.current === controller) {
        active.current = null;
        setLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [refresh]);
  // Revalidate according to the backend TTL; a 60-second floor also prevents tight loops.
  useEffect(() => {
    if (loading) return;
    const delay = error
      ? 60_000
      : Math.max(
          60_000,
          Date.parse(data?.next_refresh_at || "") - Date.now() || 900_000,
        );
    const timer = setTimeout(() => void refresh(), delay);
    return () => clearTimeout(timer);
  }, [data, error, loading, refresh]);
  const quotes = Object.fromEntries(
    (data?.quotes || []).map((q) => [
      q.symbol,
      quoteForDisplay(q, Boolean(error)),
    ]),
  );
  const performance = performanceForDisplay(data?.performance, Boolean(error));
  // Never leave a portfolio total visible after one of its underlying quotes expires.
  const displayedPerformance = performance?.positions.every(
    (p) => p.value === null || quotes[p.symbol]?.close != null,
  )
    ? performance
    : null;
  return (
    <Context.Provider
      value={{
        data,
        quotes,
        performance: displayedPerformance,
        loading,
        error,
        refresh,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useMarketData() {
  const context = useContext(Context);
  if (!context) throw new Error("MarketDataProvider is missing");
  return context;
}

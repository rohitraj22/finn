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
  Announcement,
  FilingInsight,
  AnnouncementSnapshot,
  filingsInWindow,
  parseAnnouncements,
} from "@/lib/announcements";
type State = {
  data: AnnouncementSnapshot | null;
  items: Announcement[];
  loading: boolean;
  error: string | null;
  now: number;
  refresh: () => void;
  analyze: (id: string) => void;
};
const Context = createContext<State | null>(null);
export function AnnouncementDataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [insights, setInsights] = useState<Record<string, FilingInsight>>({});
  const fetchInsights = useCallback(async (id?: string) => {
    try {
      const r = await fetch(
        id
          ? `/api/announcements/${encodeURIComponent(id)}/analyze`
          : "/api/announcements/insights",
        {
          method: id ? "POST" : "GET",
          cache: "no-store",
          signal: AbortSignal.timeout(100_000),
        },
      );
      if (!r.ok) throw new Error();
      const value = await r.json();
      setInsights((old) => (id ? { ...old, ...value } : value));
    } catch {
      if (id)
        setInsights((old) => ({
          ...old,
          [id]: {
            status: "unavailable",
            error: "AI unavailable; rule-based labels retained.",
          },
        }));
    }
  }, []);
  const [data, setData] = useState<AnnouncementSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 100_000);
    setLoading(true);
    try {
      const response = await fetch("/api/announcements", {
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok && body.schema_version !== 1)
        throw new Error(body.error || "Announcements are unavailable.");
      const parsed = parseAnnouncements(body);
      if (active.current !== controller) return;
      setData(parsed);
      setError(
        parsed.status === "unavailable"
          ? "Official exchange feeds are unavailable. Please retry."
          : null,
      );
      setNow(Date.now());
    } catch (e) {
      if (active.current === controller)
        setError(
          e instanceof Error && e.name !== "AbortError"
            ? e.message
            : "Announcement request timed out. Please retry.",
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
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (loading) return;
    const delay = error
      ? 120_000
      : Math.max(
          60_000,
          Date.parse(data?.next_refresh_at || "") - Date.now() || 600_000,
        );
    const t = setTimeout(() => void refresh(), delay);
    return () => clearTimeout(t);
  }, [loading, error, data, refresh]);
  useEffect(() => {
    if (data) void fetchInsights();
  }, [data, fetchInsights]);
  useEffect(() => {
    if (!Object.values(insights).some((i) => i.status === "pending")) return;
    const timer = setTimeout(() => void fetchInsights(), 12_000);
    return () => clearTimeout(timer);
  }, [insights, fetchInsights]);
  const items = filingsInWindow(data?.items || [], 720, now).map((a) => {
    const insight = insights[a.id];
    return {
      ...a,
      stale: Boolean(error) || a.stale,
      insight,
      ...(insight?.status === "available"
        ? {
            priority: insight.importance || a.priority,
            categories: insight.categories || a.categories,
          }
        : {}),
    };
  });
  return (
    <Context.Provider
      value={{
        data,
        items,
        loading,
        error,
        now,
        refresh,
        analyze: (id) => void fetchInsights(id),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAnnouncements() {
  const c = useContext(Context);
  if (!c) throw new Error("AnnouncementDataProvider is missing");
  return c;
}

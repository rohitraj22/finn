"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import {
  LayoutDashboard,
  ChartNoAxesCombined,
  Bell,
  Sparkles,
  ArrowUpRight,
  Search,
  FlaskConical,
  ChevronRight,
} from "lucide-react";
import { MarketDataProvider } from "./market-data-provider";
import {
  AnnouncementDataProvider,
  useAnnouncements,
} from "./announcement-data-provider";
import { filingsInWindow } from "@/lib/announcements";
const nav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/portfolio", label: "Portfolio", icon: ChartNoAxesCombined },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/research", label: "AI Research", icon: Sparkles },
];
const AlertContext = createContext<{
  readIds: string[];
  markRead: (ids: string[]) => void;
}>({ readIds: [], markRead: () => {} });
export const useAlerts = () => useContext(AlertContext);
export function FinnMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`finn-mark ${small ? "small" : ""}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <MarketDataProvider>
      <AnnouncementDataProvider>
        <ShellContent>{children}</ShellContent>
      </AnnouncementDataProvider>
    </MarketDataProvider>
  );
}
function ShellContent({ children }: { children: React.ReactNode }) {
  const { items, now } = useAnnouncements();
  const path = usePathname();
  const [readIds, setReadIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("finn-read-filings-v1") || "[]",
      );
      if (Array.isArray(saved))
        setReadIds(
          saved.filter((id: unknown): id is string => typeof id === "string"),
        );
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded)
      try {
        localStorage.setItem("finn-read-filings-v1", JSON.stringify(readIds));
      } catch {}
  }, [readIds, loaded]);
  const unread = filingsInWindow(items, 24, now).filter(
    (a) => !readIds.includes(a.id),
  ).length;
  const markRead = (ids: string[]) =>
    setReadIds((prev) => [...new Set([...prev, ...ids])]);
  return (
    <AlertContext.Provider value={{ readIds, markRead }}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app-shell">
        <aside className="sidebar">
          <Link href="/" className="brand" aria-label="FINN home">
            <FinnMark />
            <span>
              finn<span className="brand-dot">.</span>
            </span>
          </Link>
          <div className="brand-subtitle">FINANCIAL INVESTMENT AGENT</div>
          <div className="nav-caption">YOUR WORKSPACE</div>
          <nav aria-label="Main navigation">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`nav-item ${path === n.href ? "active" : ""}`}
                aria-current={path === n.href ? "page" : undefined}
              >
                <n.icon size={19} />
                <span>{n.label}</span>
                {n.href === "/alerts" && unread > 0 && (
                  <span className="nav-count">{unread}</span>
                )}
              </Link>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-note">
              <span className="tiny-orbit">
                <Sparkles size={18} />
              </span>
              <h3>
                A little less noise.
                <br />A lot more perspective.
              </h3>
              <p>
                Your investment day,
                <br />
                thoughtfully connected.
              </p>
              <Link href="/research">
                Explore research <ArrowUpRight size={15} />
              </Link>
            </div>
            <div className="demo-user">
              <span className="avatar">DI</span>
              <div>
                <strong>Demo investor</strong>
                <small>Personal workspace</small>
              </div>
              <span className="user-dot" />
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumbs">
              <span>Workspace</span>
              <ChevronRight size={14} />
              <strong>
                {nav.find((n) => n.href === path)?.label || "FINN"}
              </strong>
            </div>
            <Link href="/" className="mobile-brand">
              <FinnMark small />
              <b>finn.</b>
            </Link>
            <div className="top-actions">
              <Link className="header-search" href="/portfolio">
                <Search size={17} />
                <span>Find a company</span>
              </Link>
              <span className="demo-pill">
                <span /> Demo workspace
              </span>
              <Link
                className="notification-button"
                href="/alerts"
                aria-label={`Alerts, ${unread} unread`}
              >
                <Bell size={19} />
                {unread > 0 && <i />}
              </Link>
            </div>
          </header>
          <main id="main" className="main-content">
            {children}
            <footer className="page-footer">
              <span>
                <FlaskConical size={13} /> Real quotes & filings · Hypothetical
                holdings · Document-based research.
              </span>
              <span>FINN · Prototype 05</span>
            </footer>
          </main>
        </div>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={path === n.href ? "active" : ""}
              aria-current={path === n.href ? "page" : undefined}
            >
              <n.icon size={21} />
              <span>{n.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </AlertContext.Provider>
  );
}

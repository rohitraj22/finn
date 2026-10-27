"""Yahoo daily bars, explicit EOD filtering, and a bounded last-known-good cache.

No fixture prices are imported or used here. Run a single Uvicorn worker locally.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from threading import Lock
from typing import Callable, Literal
from zoneinfo import ZoneInfo
import logging
import math
import os

import pandas as pd
from pydantic import BaseModel, ConfigDict, Field

from backend.performance import HOLDINGS, PURCHASE_DATE, Performance, build_performance, cents

IST = ZoneInfo("Asia/Kolkata")
SYMBOLS = tuple(h["symbol"] for h in HOLDINGS)
CACHE_TTL = 900
RETRY_TTL = 60
MAX_STALE = timedelta(days=7)
logger = logging.getLogger(__name__)


class Quote(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    symbol: str
    yahoo_symbol: str
    currency: Literal["INR"] = "INR"
    source: Literal["Yahoo Finance via yfinance"] = "Yahoo Finance via yfinance"
    status: Literal["available", "stale", "unavailable"]
    close: float | None = Field(default=None, gt=0)
    previous_close: float | None = Field(default=None, gt=0)
    change: float | None = None
    change_percent: float | None = None
    volume: int | None = Field(default=None, ge=0)
    average_volume_20d: float | None = Field(default=None, ge=0)
    volume_ratio: float | None = Field(default=None, ge=0)
    volume_sessions: int = 0
    market_date: str | None = None
    previous_market_date: str | None = None
    session_close_at: datetime | None = None
    fetched_at: datetime | None = None
    warnings: list[str] = Field(default_factory=list)
    error: str | None = None


class Snapshot(BaseModel):
    schema_version: Literal[2] = 2
    performance: Performance
    source: Literal["Yahoo Finance via yfinance"] = "Yahoo Finance via yfinance"
    currency: Literal["INR"] = "INR"
    quotes: list[Quote]
    requested_count: int = len(SYMBOLS)
    available_count: int
    status: Literal["ok", "partial", "stale", "unavailable"]
    latest_market_date: str | None
    oldest_market_date: str | None
    last_attempt_at: datetime
    next_refresh_at: datetime
    cache_hit: bool = False
    cache_ttl_seconds: int = CACHE_TTL
    # The date comes from the daily bar; 15:30 is a scheduled close, not a tick timestamp.
    timestamp_note: str = "Daily session date from Yahoo; 15:30 IST is the regular scheduled close, not an exchange tick timestamp. Today is excluded until 16:00 IST."
    error: str | None = None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def download_history() -> pd.DataFrame:
    import yfinance as yf
    # Keep library cookies/timezone caches inside the application, not the user profile.
    cache_dir = Path(os.environ.get("FINN_CACHE_DIR", Path(__file__).parent / ".cache"))
    cache_dir.mkdir(parents=True, exist_ok=True)
    yf.set_tz_cache_location(str(cache_dir / "yfinance"))
    return yf.download(
        tickers=[f"{s}.NS" for s in SYMBOLS], start=PURCHASE_DATE, interval="1d",
        auto_adjust=False, back_adjust=False, actions=False, repair=False,
        group_by="ticker", multi_level_index=True, keepna=True,
        threads=6, progress=False, timeout=12,
    )


def ticker_frame(frame: pd.DataFrame, symbol: str) -> pd.DataFrame:
    if frame is None or frame.empty:
        raise ValueError("Provider returned no daily history.")
    ticker = f"{symbol}.NS"
    if not isinstance(frame.columns, pd.MultiIndex):
        raise ValueError("Unexpected provider column format.")
    # yfinance can expose ticker-first or field-first MultiIndex columns.
    for level in range(frame.columns.nlevels):
        if ticker in frame.columns.get_level_values(level):
            return frame.xs(ticker, axis=1, level=level).copy()
    raise ValueError("No daily history returned for this symbol.")


def number(value, *, positive=False) -> float | None:
    try:
        n = float(value)
        if not math.isfinite(n) or n < 0 or (positive and n == 0):
            return None
        return n
    except (ValueError, TypeError):
        return None


def quote_from_history(symbol: str, history: pd.DataFrame, now: datetime) -> Quote:
    if history.empty or not {"Close", "Volume"}.issubset(history.columns):
        raise ValueError("Daily close or volume history is missing.")
    history = history.copy()
    dates = pd.DatetimeIndex(pd.to_datetime(history.index))
    if dates.tz is not None:
        dates = dates.tz_convert(IST)
    history.index = dates.date
    history = history[~history.index.duplicated(keep="last")].sort_index()
    local = now.astimezone(IST)
    cutoff = local.date() if local.time() >= time(16, 0) else local.date() - timedelta(days=1)
    history = history.loc[history.index <= cutoff]
    # A batch frame contains all-NaN rows for another ticker's sessions; these are not bars.
    history = history.dropna(how="all")
    if history.empty:
        raise ValueError("No completed daily session is available.")
    # Yahoo may publish OHLC/volume before a usable close (observed in live testing).
    # Choose the latest *available* close and expose the skipped dates explicitly.
    latest_reported_date = history.index[-1]
    valid_close = history["Close"].map(lambda v: number(v, positive=True) is not None)
    if not valid_close.any():
        raise ValueError("No completed bar has a valid closing price.")
    latest_valid_date = history.index[valid_close][-1]
    history = history.loc[history.index <= latest_valid_date]
    row = history.iloc[-1]
    close = cents(number(row["Close"], positive=True))
    previous = history.iloc[-2] if len(history) > 1 else None
    previous_close = number(previous["Close"], positive=True) if previous is not None else None
    previous_close = cents(previous_close) if previous_close is not None else None
    raw_volume = number(row["Volume"])
    volume = int(raw_volume) if raw_volume is not None and raw_volume.is_integer() else None
    prior = history.iloc[:-1].tail(20)
    volumes = [number(v) for v in prior["Volume"]]
    valid_volumes = [v for v in volumes if v is not None and v.is_integer()]
    average = sum(valid_volumes) / 20 if len(valid_volumes) == 20 else None
    warnings = []
    if latest_valid_date != latest_reported_date:
        warnings.append(f"Provider close is missing for a newer session ({latest_reported_date}); showing the last valid close from {latest_valid_date}.")
    if previous_close is None:
        warnings.append("Previous session close unavailable; daily change cannot be calculated.")
    if volume is None:
        warnings.append("Latest session trading volume is unavailable.")
    if average is None:
        warnings.append("A complete previous 20-session volume window is unavailable.")
    elif average == 0:
        warnings.append("Previous 20-session average volume is zero; ratio is undefined.")
    market_date = history.index[-1]
    if (local.date() - market_date).days > 7:
        warnings.append("Provider's latest session is more than seven calendar days old.")
    change = close - previous_close if previous_close is not None else None
    return Quote(
        symbol=symbol, yahoo_symbol=f"{symbol}.NS", status="available", close=close,
        previous_close=previous_close, change=change,
        change_percent=(change / previous_close * 100) if change is not None else None,
        volume=volume, average_volume_20d=average,
        volume_ratio=volume / average if volume is not None and average is not None and average > 0 else None,
        volume_sessions=len(valid_volumes), market_date=market_date.isoformat(),
        previous_market_date=history.index[-2].isoformat() if previous is not None else None,
        session_close_at=datetime.combine(market_date, time(15, 30), IST),
        fetched_at=now, warnings=warnings,
    )


class MarketService:
    def __init__(self, provider: Callable = download_history, clock: Callable = utc_now,
                 cache_path: Path | None = None):
        self.provider = provider
        self.clock = clock
        self.lock = Lock()
        self.cache_path = cache_path
        self.snapshot: Snapshot | None = None
        if cache_path and cache_path.exists():
            try:
                saved = Snapshot.model_validate_json(cache_path.read_text())
                if ([q.symbol for q in saved.quotes] == list(SYMBOLS)
                    and saved.performance.purchase_date == PURCHASE_DATE
                    and [(p.symbol, p.quantity) for p in saved.performance.positions] == [(h["symbol"], h["quantity"]) for h in HOLDINGS]):
                    self.snapshot = saved
            except (ValueError, OSError):
                logger.warning("Ignoring invalid market cache.")

    def get(self) -> Snapshot:
        # Blocking I/O is called from FastAPI's sync endpoint/thread pool.
        # One lock covers the check/fetch/write to coalesce simultaneous misses.
        with self.lock:
            now = self.clock()
            if self.snapshot and now < self.snapshot.next_refresh_at:
                return self.snapshot.model_copy(update={"cache_hit": True}, deep=True)
            old = {q.symbol: q for q in self.snapshot.quotes} if self.snapshot else {}
            try:
                frame = self.provider()
                provider_error = None
            except Exception:
                logger.exception("Market history request failed")
                frame = None
                provider_error = "Yahoo Finance could not be reached or rate-limited the request."
            fetched_at = self.clock()
            quotes = []
            for symbol in SYMBOLS:
                try:
                    if provider_error:
                        raise ValueError(provider_error)
                    quote = quote_from_history(symbol, ticker_frame(frame, symbol), fetched_at)
                    quotes.append(quote)
                except (ValueError, TypeError, KeyError, IndexError) as exc:
                    error = str(exc)
                    previous = old.get(symbol)
                    if previous and previous.close is not None and previous.fetched_at and timedelta(0) <= fetched_at - previous.fetched_at <= MAX_STALE:
                        quotes.append(previous.model_copy(update={"status": "stale", "error": error}))
                    else:
                        quotes.append(Quote(symbol=symbol, yahoo_symbol=f"{symbol}.NS", status="unavailable", error=error))
            histories = {}
            for symbol in SYMBOLS:
                try:
                    histories[symbol] = ticker_frame(frame, symbol)
                except (ValueError, TypeError, KeyError):
                    pass
            performance = build_performance(histories, quotes, fetched_at)
            available = sum(q.close is not None for q in quotes)
            fresh = sum(q.status == "available" for q in quotes)
            status = "ok" if fresh == len(SYMBOLS) else "unavailable" if available == 0 else "stale" if fresh == 0 else "partial"
            if status == "ok" and performance.status == "partial":
                status = "partial"
            if status == "stale" and self.snapshot and fetched_at - self.snapshot.performance.fetched_at <= MAX_STALE:
                performance = self.snapshot.performance.model_copy(update={"status": "stale"}, deep=True)
            dates = [q.market_date for q in quotes if q.market_date]
            ttl = CACHE_TTL if status == "ok" else RETRY_TTL
            # A pre-close cached response cannot hide the first eligible post-close bar.
            boundary = datetime.combine(fetched_at.astimezone(IST).date(), time(16), IST)
            expires = fetched_at + timedelta(seconds=ttl)
            if fetched_at < boundary < expires:
                expires = boundary
            result = Snapshot(
                performance=performance, quotes=quotes, available_count=available, status=status,
                latest_market_date=max(dates) if dates else None,
                oldest_market_date=min(dates) if dates else None,
                last_attempt_at=fetched_at, next_refresh_at=expires, cache_ttl_seconds=ttl,
                error=None if status == "ok" else "Some market prices or purchase-date history are unavailable. Cached quotes, if any, are explicitly marked stale.",
            )
            self.snapshot = result
            if self.cache_path:
                try:
                    self.cache_path.parent.mkdir(parents=True, exist_ok=True)
                    temporary = self.cache_path.with_suffix(".tmp")
                    temporary.write_text(result.model_dump_json(indent=2))
                    temporary.replace(self.cache_path)
                except OSError:
                    logger.warning("Could not persist market cache; memory cache remains active.")
            return result.model_copy(deep=True)

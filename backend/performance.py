"""Deterministic price-only simulation. Never fills missing prices or sums partial holdings."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo
import json
import math

import pandas as pd
from pydantic import BaseModel, ConfigDict, Field

CONFIG = json.loads((Path(__file__).resolve().parents[1] / "data/portfolio.json").read_text())
HOLDINGS = CONFIG["holdings"]
PURCHASE_DATE = CONFIG["purchase_date"]


class FinancialModel(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)


class Position(FinancialModel):
    symbol: str
    quantity: int
    purchase_price: float | None = None
    invested: float | None = None
    value: float | None = None
    profit: float | None = None
    return_percent: float | None = None
    weight: float | None = None
    error: str | None = None


class Point(FinancialModel):
    date: str
    value: float | None
    missing_symbols: list[str] = Field(default_factory=list)


class Period(FinancialModel):
    requested_start: str
    start_date: str | None = None
    end_date: str | None = None
    points: list[Point] = Field(default_factory=list)
    profit: float | None = None
    return_percent: float | None = None
    missing_sessions: int = 0
    error: str | None = None


class Performance(FinancialModel):
    purchase_date: str = PURCHASE_DATE
    status: Literal["available", "partial", "unavailable", "stale"] = "unavailable"
    fetched_at: datetime
    valuation_date: str | None = None
    invested: float | None = None
    value: float | None = None
    profit: float | None = None
    return_percent: float | None = None
    day_change: float | None = None
    day_percent: float | None = None
    positions: list[Position] = Field(default_factory=list)
    periods: dict[str, Period] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    methodology: str = "Fixed hypothetical quantities on Yahoo's split-adjusted share basis, valued at historical closing prices. Prices rounded to paise. Price returns only; dividends, fees, taxes and cash flows excluded. Simulated performance, not actual investor returns."


def cents(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def valid_price(value) -> float | None:
    try:
        value = float(value)
        return cents(value) if math.isfinite(value) and cents(value) > 0 else None
    except (ValueError, TypeError):
        return None


def normalize_history(history: pd.DataFrame, cutoff: str) -> pd.DataFrame:
    dates = pd.DatetimeIndex(pd.to_datetime(history.index))
    if dates.tz is not None:
        dates = dates.tz_convert(ZoneInfo("Asia/Kolkata"))
    history = history.copy()
    history.index = dates.strftime("%Y-%m-%d")
    history = history[~history.index.duplicated(keep="last")].sort_index()
    return history.loc[(history.index >= PURCHASE_DATE) & (history.index <= cutoff)]


def build_performance(histories: dict[str, pd.DataFrame], quotes: list, now: datetime) -> Performance:
    result = Performance(fetched_at=now)
    by_symbol = {q.symbol: q for q in quotes}
    dates = [q.market_date for q in quotes if q.close is not None]
    # Charts end at the latest quoted session; a missing constituent produces a gap,
    # rather than silently backdating the entire portfolio to an earlier common day.
    cutoff = max(dates) if dates else PURCHASE_DATE
    normalized = {s: normalize_history(h, cutoff) for s, h in histories.items()}
    prices = {}
    for s, h in normalized.items():
        if "Close" in h:
            prices[s] = {d: valid_price(v) for d, v in h["Close"].items()}
    for h in HOLDINGS:
        s, quantity = h["symbol"], h["quantity"]
        q = by_symbol.get(s)
        purchase = prices.get(s, {}).get(PURCHASE_DATE)
        value = cents(q.close * quantity) if q and q.close is not None else None
        invested = cents(purchase * quantity) if purchase is not None else None
        profit = cents(value - invested) if value is not None and invested is not None else None
        result.positions.append(Position(
            symbol=s, quantity=quantity, purchase_price=purchase, invested=invested,
            value=value, profit=profit,
            return_percent=profit / invested * 100 if profit is not None else None,
            error=None if purchase is not None else f"Historical close unavailable on {PURCHASE_DATE}; cost and return cannot be calculated.",
        ))
    if all(p.invested is not None for p in result.positions):
        result.invested = cents(sum(p.invested for p in result.positions))
    else:
        result.warnings.append("Purchase-date history is incomplete; total invested capital and total return are unavailable.")
    if len(dates) == len(HOLDINGS) and len(set(dates)) == 1:
        result.valuation_date = dates[0]
        result.value = cents(sum(p.value for p in result.positions))
        for p in result.positions:
            p.weight = p.value / result.value * 100
        previous_dates = {q.previous_market_date for q in quotes}
        if all(q.previous_close is not None for q in quotes) and len(previous_dates) == 1 and None not in previous_dates:
            previous = cents(sum(cents(by_symbol[h["symbol"]].previous_close * h["quantity"]) for h in HOLDINGS))
            result.day_change = cents(result.value - previous)
            result.day_percent = result.day_change / previous * 100
    else:
        result.warnings.append("Portfolio value and weights require all 18 prices from the same session. Missing or mixed-session prices are not summed.")
    if result.value is not None and result.invested is not None:
        result.profit = cents(result.value - result.invested)
        result.return_percent = result.profit / result.invested * 100
    session_dates = sorted({d for h in normalized.values() for d in h.index})
    points = []
    for d in session_dates:
        missing = [h["symbol"] for h in HOLDINGS if prices.get(h["symbol"], {}).get(d) is None]
        value = None if missing else cents(sum(cents(prices[h["symbol"]][d] * h["quantity"]) for h in HOLDINGS))
        points.append(Point(date=d, value=value, missing_symbols=missing))
    # Never make a stale quote look like a newly fetched historical point.
    if dates and (not points or points[-1].date != cutoff):
        points.append(Point(date=cutoff, value=None, missing_symbols=[h["symbol"] for h in HOLDINGS]))
    if dates:
        for name, offset in {"1W": pd.DateOffset(weeks=1), "1M": pd.DateOffset(months=1), "3M": pd.DateOffset(months=3), "1Y": pd.DateOffset(years=1)}.items():
            target = (pd.Timestamp(cutoff) - offset).strftime("%Y-%m-%d")
            # Non-trading boundary: use the last observed session on/before target.
            # If that session has missing prices, do not skip backward to a convenient one.
            before = [i for i, p in enumerate(points) if p.date <= target]
            selected = points[before[-1]:] if before else points
            period = Period(requested_start=target, points=selected, start_date=selected[0].date if selected else None, end_date=cutoff,
                            missing_sessions=sum(p.value is None for p in selected))
            if before and len(selected) >= 2 and selected[0].value is not None and selected[-1].value is not None:
                period.profit = cents(selected[-1].value - selected[0].value)
                period.return_percent = period.profit / selected[0].value * 100
            else:
                period.error = "A complete starting and ending valuation is unavailable for this period."
            result.periods[name] = period
    result.status = "available" if result.profit is not None else "partial" if dates else "unavailable"
    if result.status == "available" and any(q.status == "stale" for q in quotes):
        result.status = "stale"
    return result

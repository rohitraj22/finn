"""Synthetic market inputs are limited to tests; live code has no price fixtures."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from backend.main import create_app
from backend.market import MarketService, SYMBOLS
from backend.performance import HOLDINGS, PURCHASE_DATE, cents

NOW = datetime(2026, 10, 28, 11, tzinfo=timezone.utc)


def history_batch():
    days = pd.bdate_range(PURCHASE_DATE, "2026-10-28")
    return pd.concat({f"{s}.NS": pd.DataFrame({
        "Close": [100 + j * 10 + i * .123 for i in range(len(days))],
        # Deliberately different: dividend-adjusted prices must not enter price returns.
        "Adj Close": [90 + i * .1 for i in range(len(days))],
        "Volume": 1000,
    }, index=days) for j,s in enumerate(SYMBOLS)},axis=1)


def snapshot(frame=None):
    return MarketService(provider=lambda: history_batch() if frame is None else frame, clock=lambda:NOW).get()


def test_cost_value_profit_weights_and_chart_endpoints_reconcile():
    s=snapshot(); p=s.performance
    assert p.status == "available" and p.purchase_date == "2025-10-01"
    assert p.invested == sum(h["quantity"]*(100+i*10) for i,h in enumerate(HOLDINGS))
    assert p.value == cents(sum(r.value for r in p.positions))
    assert p.invested == cents(sum(r.invested for r in p.positions))
    assert p.profit == cents(sum(r.profit for r in p.positions)) == cents(p.value-p.invested)
    assert p.return_percent == pytest.approx(p.profit/p.invested*100)
    assert sum(r.weight for r in p.positions) == pytest.approx(100)
    for row,q,h in zip(p.positions,s.quotes,HOLDINGS):
        assert row.quantity == h['quantity']
        assert row.value == cents(q.close*row.quantity)
        assert row.profit == cents(row.value-row.invested)
        assert row.return_percent == pytest.approx(row.profit/row.invested*100)
        assert row.weight == pytest.approx(row.value/p.value*100)
    previous=cents(sum(cents(q.previous_close*h['quantity']) for q,h in zip(s.quotes,HOLDINGS)))
    assert p.day_change == cents(p.value-previous)
    assert p.day_percent == pytest.approx(p.day_change/previous*100)
    for period in p.periods.values():
        assert period.points[-1].value == p.value
        assert period.profit == cents(p.value-period.points[0].value)
        assert period.return_percent == pytest.approx(period.profit/period.points[0].value*100)
        assert all(point.value is not None for point in period.points)


def test_periods_use_calendar_boundaries_and_previous_observed_session():
    p=snapshot().performance.periods
    assert [p[k].requested_start for k in ['1W','1M','3M','1Y']] == ['2026-10-21','2026-09-28','2026-07-28','2025-10-28']
    assert len(p['1W'].points)<len(p['1M'].points)<len(p['3M'].points)<len(p['1Y'].points)
    f=history_batch().loc[:'2026-10-26']
    p=snapshot(f).performance.periods
    assert p['1M'].requested_start=='2026-09-26' # Saturday
    assert p['1M'].start_date=='2026-09-25'
    assert p['1Y'].start_date=='2025-10-24' # target Sunday


def test_purchase_close_missing_does_not_move_purchase_or_substitute_cost():
    f=history_batch(); f.loc[PURCHASE_DATE,('TCS.NS','Close')]=float('nan')
    p=snapshot(f).performance
    tcs=next(r for r in p.positions if r.symbol=='TCS')
    assert tcs.purchase_price is None and tcs.invested is None and tcs.profit is None
    assert p.invested is None and p.profit is None and p.return_percent is None
    assert p.value is not None and tcs.value is not None
    assert tcs.error and p.warnings
    assert p.periods['1M'].profit is not None # unrelated later history is still usable


def test_missing_internal_close_is_a_gap_not_forward_filled():
    f=history_batch(); f.loc['2026-10-23',('TCS.NS','Close')]=float('nan')
    p=snapshot(f).performance
    period=p.periods['1W']; gap=next(point for point in period.points if point.date=='2026-10-23')
    assert gap.value is None and gap.missing_symbols==['TCS']
    assert period.missing_sessions==1
    assert period.profit is not None # independently observed endpoints still give a valid return


def test_missing_boundary_close_is_not_skipped_to_get_a_return():
    f=history_batch(); f.loc['2026-10-21',('TCS.NS','Close')]=float('nan')
    period=snapshot(f).performance.periods['1W']
    assert period.start_date=='2026-10-21' and period.points[0].value is None
    assert period.profit is None and period.return_percent is None and period.error


def test_missing_latest_close_suppresses_mixed_session_totals_and_chart_return():
    f=history_batch(); f.loc['2026-10-28',('TCS.NS','Close')]=float('nan')
    p=snapshot(f).performance
    assert p.value is None and p.profit is None and p.valuation_date is None
    assert all(r.weight is None for r in p.positions)
    assert p.periods['1W'].points[-1].value is None
    assert p.periods['1W'].profit is None


def test_missing_entire_symbol_never_produces_partial_total():
    f=history_batch().drop(columns='TCS.NS',level=0)
    p=snapshot(f).performance
    assert p.value is None and p.invested is None
    assert all(point.value is None for point in p.periods['1M'].points)


def test_insufficient_history_does_not_claim_one_year_return():
    p=snapshot(history_batch().loc['2026-09-01':]).performance
    assert p.periods['1Y'].profit is None and p.periods['1Y'].error
    assert p.periods['1M'].profit is not None


def test_today_exclusion_applies_to_history_and_summary_together():
    s=MarketService(provider=history_batch,clock=lambda:NOW.replace(hour=9)).get()
    assert s.performance.valuation_date=='2026-10-27'
    assert all(p.points[-1].date=='2026-10-27' and p.points[-1].value==s.performance.value for p in s.performance.periods.values())


def test_prices_that_produce_losses_and_flat_history_are_supported():
    f=history_batch()
    for s in SYMBOLS:
        f[(s+'.NS','Close')]=100.
    p=snapshot(f).performance
    assert p.profit==0 and p.return_percent==0
    assert all(x.profit==0 and x.return_percent==0 for x in p.periods.values())
    for s in SYMBOLS:
        f.loc['2026-10-28',(s+'.NS','Close')]=80.
    p=snapshot(f).performance
    assert p.return_percent==-20 and p.day_percent==-20


def test_cached_history_is_atomic_stale_and_expires(tmp_path):
    now=[NOW]; calls=[]
    def fetch():
        calls.append(1)
        return history_batch()
    path=tmp_path/'snapshot.json'
    service=MarketService(provider=fetch,clock=lambda:now[0],cache_path=path)
    client=TestClient(create_app(service))
    first=client.get('/api/market/portfolio').json()
    assert first['schema_version']==2 and first['performance']['value'] is not None
    assert client.get('/api/market/portfolio').json()['cache_hit'] and len(calls)==1
    restored=MarketService(provider=lambda:pytest.fail('must read disk'),clock=lambda:now[0],cache_path=path)
    assert restored.get().performance.model_dump(mode='json')==first['performance']
    now[0]+=timedelta(seconds=901);service.provider=lambda:pd.DataFrame()
    p=service.get().performance
    assert p.status=='stale' and p.fetched_at==NOW
    assert p.value==first['performance']['value']
    assert p.periods['1Y'].model_dump(mode='json')==first['performance']['periods']['1Y']
    now[0]+=timedelta(days=8)
    p=service.get().performance
    assert p.value is None and p.invested is None and not p.periods


def test_rounding_is_per_holding_to_paise_before_aggregation():
    assert cents(1.005)==1.01
    p=snapshot().performance
    # Decimal arithmetic independently checks displayed holding totals reconcile exactly.
    assert sum(Decimal(str(r.value)) for r in p.positions)==Decimal(str(p.value))
    assert sum(Decimal(str(r.profit)) for r in p.positions)==Decimal(str(p.profit))

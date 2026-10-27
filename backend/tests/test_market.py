from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from backend.main import create_app
from backend.market import IST, SYMBOLS, MarketService, quote_from_history

NOW = datetime(2026, 10, 28, 11, 0, tzinfo=timezone.utc)  # 16:30 IST


def history(count=25, end="2026-10-28", volume=100):
    return pd.DataFrame({"Close": [100.0+i for i in range(count)], "Volume": [volume]*(count-1)+[250]}, index=pd.bdate_range(end=end, periods=count, tz=IST))


def batch(symbols=SYMBOLS):
    return pd.concat({f"{s}.NS": history() for s in symbols}, axis=1)


class Clock:
    now = NOW
    def __call__(self):
        return self.now
    def advance(self, seconds):
        self.now += timedelta(seconds=seconds)


def test_daily_calculation_excludes_latest_volume_from_average():
    q = quote_from_history("TCS", history(), NOW)
    assert q.close == 124
    assert q.previous_close == 123
    assert q.change == 1
    assert q.change_percent == pytest.approx(100/123)
    assert q.volume == 250
    assert q.average_volume_20d == 100
    assert q.volume_ratio == 2.5
    assert q.volume_sessions == 20
    assert q.market_date == "2026-10-28"
    assert q.session_close_at.isoformat() == "2026-10-28T15:30:00+05:30"


def test_partial_current_day_is_excluded_until_1600_ist():
    q = quote_from_history("TCS", history(), NOW.replace(hour=10))
    assert q.market_date == "2026-10-27"
    assert q.close == 123
    assert q.volume == 100


def test_weekend_does_not_invent_a_bar():
    q = quote_from_history("TCS", history(end="2026-10-23"), datetime(2026,10,25,12,tzinfo=timezone.utc))
    assert q.market_date == "2026-10-23"


def test_insufficient_and_zero_volume_history():
    q = quote_from_history("TCS", history(count=20), NOW)
    assert q.average_volume_20d is None and q.volume_ratio is None
    assert q.volume_sessions == 19
    q = quote_from_history("TCS", history(volume=0), NOW)
    assert q.average_volume_20d == 0 and q.volume_ratio is None
    assert q.warnings


def test_bad_numeric_data_is_not_serialized_as_nan_or_silently_skipped():
    h = history()
    h.loc[h.index[-1], "Close"] = float("nan")
    q = quote_from_history("TCS", h, NOW)
    assert q.market_date == "2026-10-27" and q.close == 123
    assert any("newer session" in w for w in q.warnings)
    h["Close"] = float("nan")
    with pytest.raises(ValueError):
        quote_from_history("TCS", h, NOW)
    h = history()
    h.loc[h.index[-2], "Volume"] = float("nan")
    q = quote_from_history("TCS", h, NOW)
    assert q.average_volume_20d is None and q.volume_ratio is None
    h.loc[h.index[-1], "Volume"] = float("nan")
    assert quote_from_history("TCS", h, NOW).volume is None


def test_one_bar_price_is_available_but_change_is_not():
    q = quote_from_history("TCS", history(count=1), NOW)
    assert q.close == 100 and q.change_percent is None


def test_api_health_portfolio_stock_and_unknown_symbol():
    calls = []
    service = MarketService(provider=lambda: (calls.append(1) or batch()), clock=lambda:NOW)
    with TestClient(create_app(service)) as client:
        assert client.get('/health').json()['portfolio_symbols'] == 18
        assert calls == []
        response = client.get('/api/market/portfolio')
        assert response.status_code == 200
        body = response.json()
        assert body['available_count'] == 18 and body['status'] == 'partial'
        assert {q['symbol'] for q in body['quotes']} == set(SYMBOLS)
        assert all(q['source'] == 'Yahoo Finance via yfinance' for q in body['quotes'])
        assert client.get('/api/market/stocks/tcs').json()['close'] == 124
        assert client.get('/api/market/stocks/INVALID').status_code == 404
        assert client.get('/api/market/portfolio').json()['cache_hit'] is True
        assert len(calls) == 1


def test_failed_first_fetch_is_503_with_no_prices_and_negative_cache():
    calls = []
    service = MarketService(provider=lambda: (calls.append(1) or pd.DataFrame()), clock=lambda: NOW)
    client = TestClient(create_app(service))
    for _ in range(2):
        r = client.get('/api/market/portfolio')
        assert r.status_code == 503
        assert len(r.json()['quotes']) == 18
        assert all(q['close'] is None and q['fetched_at'] is None for q in r.json()['quotes'])
    assert len(calls) == 1


def test_partial_failure_is_per_symbol_not_a_mock_fallback():
    service = MarketService(provider=lambda:batch(SYMBOLS[:-1]),clock=lambda:NOW)
    r = TestClient(create_app(service)).get('/api/market/portfolio')
    assert r.status_code == 200
    assert r.json()['available_count'] == 17
    assert r.json()['status'] == 'partial'
    assert r.json()['quotes'][-1]['close'] is None


def test_cache_expiry_stale_fallback_preserves_original_timestamp_and_recovers(tmp_path):
    clock = Clock()
    cache = tmp_path / 'cache.json'
    service = MarketService(provider=batch,clock=clock,cache_path=cache)
    first = service.get()
    clock.advance(901)
    service.provider = lambda: pd.DataFrame()
    stale = service.get()
    assert stale.status == 'stale'
    assert stale.quotes[0].fetched_at == first.quotes[0].fetched_at
    assert stale.quotes[0].status == 'stale'
    assert stale.last_attempt_at > first.last_attempt_at
    assert service.get().cache_hit
    clock.advance(61)
    service.provider = batch
    assert service.get().status == 'partial'
    restored = MarketService(provider=lambda:pytest.fail('Disk cache must avoid download'),clock=clock,cache_path=cache)
    assert restored.get().cache_hit
    clock.advance(8*24*3600)
    service.provider = lambda:pd.DataFrame()
    assert service.get().status == 'unavailable'


def test_invalid_disk_cache_and_exception_return_unavailable(tmp_path):
    cache=tmp_path/'bad.json';cache.write_text('not json')
    def fail():
        raise RuntimeError('rate limited')
    s=MarketService(provider=fail,clock=lambda:NOW,cache_path=cache)
    assert s.get().status == 'unavailable'


def test_concurrent_requests_coalesce():
    calls=[]
    def fetch():
        calls.append(1)
        return batch()
    s=MarketService(provider=fetch,clock=lambda:NOW)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results=list(pool.map(lambda _:s.get(),range(8)))
    assert len(calls)==1 and all(r.available_count==18 for r in results)


def test_cache_expires_at_eod_boundary():
    now=NOW.replace(hour=10,minute=29)  # 15:59 IST
    s=MarketService(provider=batch,clock=lambda:now)
    assert s.get().next_refresh_at.astimezone(IST).isoformat()=='2026-10-28T16:00:00+05:30'


def test_field_first_multiindex_is_supported():
    frame=batch().swaplevel(axis=1)
    s=MarketService(provider=lambda:frame,clock=lambda:NOW)
    assert s.get().available_count==18


def test_old_provider_data_gets_explicit_warning():
    q=quote_from_history('TCS',history(end='2026-09-01'),NOW)
    assert any('seven calendar days' in w for w in q.warnings)

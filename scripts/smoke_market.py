"""Live read-only endpoint checks. Start both local servers first."""
import json
from urllib.request import urlopen
from urllib.error import HTTPError


def get(url):
    with urlopen(url, timeout=100) as response:
        return response.status, json.load(response)


_, health = get('http://127.0.0.1:8000/health')
assert health['portfolio_symbols'] == 18
_, portfolio = get('http://127.0.0.1:8000/api/market/portfolio')
assert portfolio['available_count'] == 18, 'Yahoo did not return all 18 usable quotes.'
assert len(portfolio['quotes']) == 18
assert all(q['close'] > 0 and q['source'] == 'Yahoo Finance via yfinance' for q in portfolio['quotes'])
_, cached = get('http://127.0.0.1:8000/api/market/portfolio')
assert cached['cache_hit'] and cached['last_attempt_at'] == portfolio['last_attempt_at']
_, tcs = get('http://127.0.0.1:8000/api/market/stocks/TCS')
assert tcs['symbol'] == 'TCS'
assert abs(tcs['change_percent'] - (tcs['close']/tcs['previous_close']-1)*100) < 1e-8
assert abs(tcs['volume_ratio'] - tcs['volume']/tcs['average_volume_20d']) < 1e-8
try:
    get('http://127.0.0.1:8000/api/market/stocks/INVALID')
    raise AssertionError('Expected 404')
except HTTPError as exc:
    assert exc.code == 404
_, proxy = get('http://127.0.0.1:3000/api/market')
assert proxy['quotes'] == cached['quotes']
assert proxy['performance'] == cached['performance']
p=portfolio['performance']
assert p['status']=='available' and p['purchase_date']=='2025-10-01'
from decimal import Decimal, ROUND_HALF_UP
cent=lambda n: Decimal(str(n)).quantize(Decimal('.01'),rounding=ROUND_HALF_UP)
assert sum(cent(r['value']) for r in p['positions'])==cent(p['value'])
assert sum(cent(r['invested']) for r in p['positions'])==cent(p['invested'])
assert sum(cent(r['profit']) for r in p['positions'])==cent(p['profit'])
assert cent(p['value'])-cent(p['invested'])==cent(p['profit'])
assert abs(sum(r['weight'] for r in p['positions'])-100)<1e-9
for r,q in zip(p['positions'],portfolio['quotes']):
    assert cent(r['value'])==cent(q['close']*r['quantity'])
    assert cent(r['invested'])==cent(r['purchase_price']*r['quantity'])
for period in p['periods'].values():
    assert period['points'][-1]['value']==p['value']
    assert cent(period['profit'])==cent(period['points'][-1]['value'])-cent(period['points'][0]['value'])
    assert abs(period['return_percent']-period['profit']/period['points'][0]['value']*100)<1e-9
print(json.dumps({'purchase_date':p['purchase_date'],'invested':p['invested'],'value':p['value'],'profit':p['profit'],'return_percent':p['return_percent'],'periods':{k:{'sessions':len(v['points']),'gaps':v['missing_sessions'],'profit':v['profit']} for k,v in p['periods'].items()}},indent=2))
print(json.dumps({'health':'ok','portfolio_http':200,'stock_http':200,'unknown_symbol_http':404,'frontend_proxy_http':200,'available_quotes':portfolio['available_count'],'market_date':portfolio['latest_market_date'],'fetched_at':portfolio['last_attempt_at'],'cache_reused':True,'tcs_volume_ratio':round(tcs['volume_ratio'],4)},indent=2))

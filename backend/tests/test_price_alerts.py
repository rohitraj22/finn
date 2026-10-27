from datetime import datetime,timezone
from types import SimpleNamespace as N
import pytest
from pydantic import ValidationError
from backend.price_alerts import PriceAlerts,AlertSettings

def snapshot(**changes):
 q=N(symbol='TCS',status='available',market_date='2026-10-27',change_percent=5.01,volume_sessions=20,average_volume_20d=100,volume_ratio=2.01,volume=201,close=105.01,previous_close=100)
 for k,v in changes.items():setattr(q,k,v)
 return N(quotes=[q],latest_market_date='2026-10-27',status='ok',last_attempt_at=datetime.now(timezone.utc))

def test_crossings_and_stable_ids(tmp_path):
 s=PriceAlerts(tmp_path/'settings.json');a=s.evaluate(snapshot());b=s.evaluate(snapshot())
 assert len(a['items'])==2 and a['items']==b['items']
 assert len({x['id'] for x in a['items']})==2
 assert len(s.evaluate(snapshot(market_date='2026-10-26'))['items'])==0

def test_exact_threshold_not_crossed_and_downside(tmp_path):
 s=PriceAlerts(tmp_path/'settings.json')
 assert not s.evaluate(snapshot(change_percent=5,volume_ratio=2))['items']
 assert s.evaluate(snapshot(change_percent=-5.01,volume_ratio=2))['items'][0]['condition']=='price_down'

@pytest.mark.parametrize('values',[{'status':'stale'},{'status':'unavailable'},{'change_percent':None,'volume_sessions':19},{'change_percent':None,'average_volume_20d':0}])
def test_missing_and_stale_excluded(tmp_path,values):
 assert not PriceAlerts(tmp_path/'settings.json').evaluate(snapshot(**values))['items']

def test_persistence_and_recheck(tmp_path):
 p=tmp_path/'settings.json';s=PriceAlerts(p);s.save(AlertSettings(price_up_percent=8,price_down_percent=9,volume_multiple=3))
 assert PriceAlerts(p).settings().volume_multiple==3
 assert not s.evaluate(snapshot())['items']

@pytest.mark.parametrize('value',[0,-1,float('nan'),float('inf')])
def test_invalid_threshold(value):
 with pytest.raises(ValidationError):AlertSettings(volume_multiple=value)

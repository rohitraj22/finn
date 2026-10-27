"""Deterministic EOD conditions over the existing market snapshot; no extra downloads."""
import json
from pathlib import Path
from threading import Lock
from pydantic import BaseModel, Field

class AlertSettings(BaseModel):
    price_up_percent: float = Field(default=5, gt=0, le=1000, allow_inf_nan=False)
    price_down_percent: float = Field(default=5, gt=0, le=100, allow_inf_nan=False)
    volume_multiple: float = Field(default=2, gt=0, le=1000, allow_inf_nan=False)

class PriceAlerts:
    def __init__(self,path:Path):
        self.path=path;self.lock=Lock()
    def settings(self):
        with self.lock:
            return AlertSettings.model_validate_json(self.path.read_text()) if self.path.exists() else AlertSettings()
    def save(self,value):
        with self.lock:
            self.path.parent.mkdir(parents=True,exist_ok=True)
            temp=self.path.with_suffix('.tmp');temp.write_text(value.model_dump_json());temp.replace(self.path)
        return value
    def evaluate(self,snapshot):
        settings=self.settings();items=[];checked=0;missing=[]
        for q in snapshot.quotes:
            if q.status!='available' or not q.market_date or q.market_date!=snapshot.latest_market_date:
                missing.append(q.symbol);continue
            checked+=1
            values=[]
            if q.change_percent is not None:
                if q.change_percent>settings.price_up_percent:values.append(('price_up',q.change_percent,settings.price_up_percent,'Daily price increase','A large daily move warrants reviewing company news and portfolio exposure.'))
                if q.change_percent < -settings.price_down_percent:values.append(('price_down',q.change_percent,-settings.price_down_percent,'Daily price decrease','A large daily decline warrants reviewing company news and portfolio exposure.'))
            if q.volume_sessions>=20 and q.average_volume_20d and q.volume_ratio is not None and q.volume_ratio>settings.volume_multiple:
                values.append(('volume',q.volume_ratio,settings.volume_multiple,'Unusual trading volume','Higher trading activity can warrant attention; volume alone does not establish a cause or price direction.'))
            if q.change_percent is None or q.volume_sessions<20 or not q.average_volume_20d:missing.append(q.symbol)
            for condition,actual,threshold,title,reason in values:
                items.append({'id':f'eod-{q.symbol}-{condition}-{q.market_date}','symbol':q.symbol,'condition':condition,'session':q.market_date,'title':title,'actual':actual,'threshold':threshold,'close':q.close,'previous_close':q.previous_close,'volume':q.volume,'average_volume_20d':q.average_volume_20d,'reason':reason})
        return {'settings':settings.model_dump(),'items':items,'session':snapshot.latest_market_date,'checked_companies':checked,'incomplete_companies':missing,'market_status':snapshot.status,'checked_at':snapshot.last_attempt_at.isoformat(),'note':'End-of-day checks on the latest available completed session. Not real-time monitoring. Conditions use strict greater-than comparisons; stale or older-session quotes are excluded.'}

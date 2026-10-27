from datetime import datetime, timezone
from types import SimpleNamespace
from io import BytesIO
from unittest.mock import patch
import pytest
from backend.announcement_ai import AnnouncementAI

@pytest.fixture
def filing():
 return SimpleNamespace(id='nse-test',symbol='TCS',company_name='TCS',title='Change',description='A director resigned.',filing_url='https://nsearchives.nseindia.com/corporate/test.pdf',source='NSE',published_at=datetime.now(timezone.utc),priority='High',stale=False)

def response():
 return {'supported':True,'categories':['management_change'],'importance':'High','summary':'A director resigned. Investors should review leadership continuity.','reason':'A leadership change warrants review.','evidence_ids':['page1']}

def run(service,filing):
 with patch('backend.announcement_ai.urlopen',return_value=BytesIO(b'%PDF-test')),patch('backend.announcement_ai.extract_pdf',return_value={'chunks':[{'id':'page1','document_id':'doc','page':1,'text':'A director resigned.'}]}):
  service.run(filing,service.key(filing))
 return service.cached(filing)

def test_verified_insight_and_cache(tmp_path,filing):
 s=AnnouncementAI(tmp_path,lambda *a:response());r=run(s,filing)
 assert r['status']=='available' and r['evidence'][0]['page']==1
 with patch.object(s.pool,'submit') as submit:s.schedule(filing);submit.assert_not_called()
 assert filing.priority=='High' and filing.description=='A director resigned.'

@pytest.mark.parametrize('change',[{'categories':['invented']},{'evidence_ids':['fake']},{'summary':'Profit increased 500 percent.'},{'supported':False}])
def test_rejects_unsupported_output(tmp_path,filing,change):
 s=AnnouncementAI(tmp_path,lambda *a:{**response(),**change})
 assert run(s,filing)['status']=='unavailable'

def test_pdf_failure_keeps_rules(tmp_path,filing):
 s=AnnouncementAI(tmp_path,lambda *a:pytest.fail('Should not call AI without filing'))
 with patch('backend.announcement_ai.urlopen',side_effect=OSError()):s.run(filing,s.key(filing))
 assert s.cached(filing)['status']=='unavailable'

def test_daily_budget_persists_and_single_flight(tmp_path,filing,monkeypatch):
 monkeypatch.setenv('GEMINI_API_KEY','test')
 s=AnnouncementAI(tmp_path);items=[SimpleNamespace(**{**vars(filing),'id':f'nse-{i}'}) for i in range(20)]
 with patch.object(s.pool,'submit') as submit:
  s.snapshot(items);s.snapshot(items)
  assert submit.call_count==12
 s2=AnnouncementAI(tmp_path)
 with patch.object(s2.pool,'submit') as submit:
  s2.snapshot(items+[SimpleNamespace(**{**vars(filing),'id':'new'})]);assert submit.call_count==12

def test_no_key_no_requests(tmp_path,filing,monkeypatch):
 monkeypatch.delenv('GEMINI_API_KEY',raising=False)
 s=AnnouncementAI(tmp_path)
 with patch.object(s.pool,'submit') as submit:s.snapshot([filing]);submit.assert_not_called()

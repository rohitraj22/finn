from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
import json
import pytest
from fastapi.testclient import TestClient
from backend.main import create_app
from backend.announcement_rules import classify
from backend.announcements import (AnnouncementService, ProviderResult, Coverage, SourceReport, SYMBOLS,
    parse_nse, parse_rss, exchange_time, filing_url, fetch_official, RSS_URLS, NSE_PAGE)

NOW=datetime(2026,10,28,6,tzinfo=timezone.utc)
START=NOW-timedelta(days=30)


def row(symbol='TCS', published='28-Oct-2026 10:30:00', name='filing.pdf'):
    return {'symbol':symbol,'desc':'Financial Results','attchmntText':'Unaudited financial results for the quarter.',
            'attchmntFile':f'https://nsearchives.nseindia.com/corporate/{name}','an_dt':published,'exchdisstime':published}


def item(name='filing.pdf', published='28-Oct-2026 10:30:00'):
    return parse_nse([row(name=name,published=published)],'TCS',START,NOW,NOW)[0][0]


def result(items=None, status='available'):
    return ProviderResult(items=[item()] if items is None else items,
        coverage=[Coverage(symbol=s,status=status,detail='Test query result',last_success_at=NOW if status=='available' else None) for s in SYMBOLS],
        sources=[SourceReport(source='NSE API',status='available' if status=='available' else 'unavailable',detail='Test source',url=NSE_PAGE)])


@pytest.mark.parametrize('subject,description,key,priority',[
 ('Financial Results','Unaudited financial results','results','High'),
 ('General Updates','Change in Managing Director and Chief Executive Officer','management_change','High'),
 ('Analysts/Institutional Investor Meet/Con. Call Updates','Link of Recording','earnings_call','Medium'),
 ('Change in Director(s)','Appointment of an independent director','management_change','High'),
 ('Resignation','Chief financial officer resigns','management_change','High'),
 ('Acquisition','Investment in a subsidiary','m_and_a','High'),
 ('Scheme','Demerger of business','m_and_a','High'),
 ('General Updates','Capacity expansion and new plant','capex','High'),
 ('Issue of Securities','Qualified institutional placement','fund_raise','High'),
 ('Buyback','Buyback of equity shares','fund_raise','High'),
 ('Dividend','Dividend record date','dividend','Medium'),
 ('Bonus Issue','Bonus shares and stock split','bonus_split','Medium'),
 ('Credit Rating','Reaffirmation of credit rating','credit_rating','Medium'),
 ('Action(s) taken or orders passed','Regulatory penalty','litigation','High'),
 ('Insider Trading','Promoter sale of shares','insider_trading','Medium'),
 ('Pledging','Release of pledged shares','pledging','Medium'),
 ('Earnings Call','Conference call discussing financial results','earnings_call','Medium'),
 ('Investor Meeting','Institutional investor meetings','investor_meetings','Routine'),
 ('Postal Ballot','Notice','postal_ballot','Routine'),
 ('Shareholders meeting','Annual general meeting','agm_egm','Routine'),
 ('Press Release','New product launch','press_release','Medium'),
 ('ESOP/ESOS/ESPS','Allotment under employee stock option scheme','unclassified','Routine'),
 ('Appointment of statutory auditor','Auditor appointment','unclassified','Routine'),
 ('Certificate','Compliance certificate under regulation 74','unclassified','Routine'),
 ('Updates','Unrecognized subject requiring review','unclassified','Medium'),
])
def test_reference_category_and_provisional_priority_rules(subject,description,key,priority):
    cats,p,reason=classify(subject,description)
    assert key in cats and p==priority and reason


def test_multiple_categories_preserved_and_no_ai_summary():
    cats,priority,_=classify('Financial Results and Dividend','Unaudited financial results and interim dividend')
    assert 'results' in cats and 'dividend' in cats and priority=='High'
    a=item()
    assert a.description=='Unaudited financial results for the quarter.'
    assert a.title=='Financial Results'


def test_nse_dissemination_time_and_ist_are_preserved():
    r=row();r['an_dt']='28-Oct-2026 10:29:59';r['exchdisstime']='28-Oct-2026 10:30:05'
    items,bad=parse_nse([r],'TCS',START,NOW,NOW)
    assert bad==0 and items[0].published_at.isoformat()=='2026-10-28T10:30:05+05:30'
    assert items[0].timestamp_basis=='Exchange dissemination time'
    assert exchange_time('Wed, 28 Oct 2026 05:00:00 GMT')==exchange_time('28-Oct-2026 10:30:00')
    with pytest.raises(ValueError): exchange_time('2026-10-28')


def test_nse_rejects_invalid_records_not_silent_empty_success():
    records=[row(symbol='INFY'),{**row(),'attchmntFile':'javascript:alert(1)'},{**row(),'exchdisstime':'invalid'}, {**row(),'desc':''},None]
    items,bad=parse_nse(records,'TCS',START,NOW,NOW)
    assert not items and bad==5
    with pytest.raises(ValueError):parse_nse({'message':'Access denied'},'TCS',START,NOW,NOW)


@pytest.mark.parametrize('url',[
 'https://nsearchives.nseindia.com.evil.test/corporate/file.pdf',
 'http://nsearchives.nseindia.com/corporate/file.pdf',
 'https://user:pass@nsearchives.nseindia.com/corporate/file.pdf',
 'https://nsearchives.nseindia.com:8443/corporate/file.pdf',
 'https://nsearchives.nseindia.com/redirect?target=evil',
 'javascript:alert(1)',
])
def test_only_official_attachment_links_allowed(url):
    with pytest.raises(ValueError):filing_url(url,'NSE')


def rss(source='BSE', title='Tata Consultancy Services Ltd (532540)'):
    link='https://www.bseindia.com/xml-data/corpfiling/AttachLive/filing.pdf' if source=='BSE' else 'https://nsearchives.nseindia.com/corporate/filing.pdf'
    return f'<rss><channel><item><title>{title}</title><link>{link}</link><description>Interim dividend declared</description><pubDate>28-Oct-2026 10:30:00</pubDate></item></channel></rss>'.encode()


def test_official_rss_exact_company_identity_and_timestamp():
    items,bad=parse_rss(rss(),'BSE',set(SYMBOLS),START,NOW,NOW)
    assert len(items)==1 and bad==0
    assert items[0].symbol=='TCS' and items[0].source_method=='BSE RSS'
    assert items[0].published_at.hour==10 and items[0].published_at.utcoffset()==timedelta(hours=5,minutes=30)
    assert not parse_rss(rss(title='TCS Different Subsidiary Ltd (123456)'),'BSE',set(SYMBOLS),START,NOW,NOW)[0]
    with pytest.raises(ValueError): parse_rss(b'<!DOCTYPE rss><rss><channel/></rss>','BSE',set(SYMBOLS),START,NOW,NOW)


def test_source_block_uses_official_rss_and_marks_history_incomplete(monkeypatch):
    def download(opener,url,referer,limit=0):
        if url==RSS_URLS['BSE']:return rss()
        if url==RSS_URLS['NSE']:return b'<rss><channel/></rss>'
        raise TimeoutError('blocked')
    monkeypatch.setattr('backend.announcements.download',download)
    r=fetch_official(START,NOW)
    assert len(r.items)==1 and r.items[0].source=='BSE'
    assert all(c.status=='partial' for c in r.coverage)
    assert '30-day archive' in r.sources[-1].detail


def test_api_time_windows_exact_boundaries_newest_first_and_cache():
    times=[NOW-timedelta(hours=h) for h in (1,24,25,168,169,720)]
    items=[item(name=f'{i}.pdf',published=t.astimezone(timezone.utc).isoformat()) for i,t in enumerate(times)]
    calls=[]
    service=AnnouncementService(provider=lambda a,b:(calls.append(1) or result(items)),clock=lambda:NOW)
    c=TestClient(create_app(announcements=service))
    for hours,count in [(24,2),(168,4),(720,6)]:
        r=c.get(f'/api/announcements?hours={hours}')
        assert r.status_code==200
        body=r.json();assert len(body['items'])==count
        dates=[a['published_at'] for a in body['items']]
        assert dates==sorted(dates,reverse=True)
    assert len(calls)==1 and c.get('/api/announcements').json()['cache_hit']
    assert c.get('/api/announcements?hours=48').status_code==422


def test_empty_success_is_distinct_from_exchange_outage():
    empty=AnnouncementService(provider=lambda a,b:result([]),clock=lambda:NOW)
    assert TestClient(create_app(announcements=empty)).get('/api/announcements').json()['status']=='ok'
    failed=AnnouncementService(provider=lambda a,b:result([],status='unavailable'),clock=lambda:NOW)
    r=TestClient(create_app(announcements=failed)).get('/api/announcements')
    assert r.status_code==503 and r.json()['items']==[] and r.json()['status']=='unavailable'


def test_deduplication_and_refreshed_filing_replaces_stale_copy():
    now=[NOW];calls=[result([item(),item()])]
    s=AnnouncementService(provider=lambda a,b:calls[0],clock=lambda:now[0])
    assert len(s.get().items)==1
    now[0]+=timedelta(seconds=601)
    fresh=item().model_copy(update={'fetched_at':now[0]})
    calls[0]=result([fresh],status='partial')
    current=s.get();assert len(current.items)==1 and not current.items[0].stale
    assert current.items[0].fetched_at==now[0]


def test_stale_original_dates_disk_reuse_recovery_and_expiry(tmp_path):
    now=[NOW];path=tmp_path/'filings.json'
    s=AnnouncementService(provider=lambda a,b:result(),clock=lambda:now[0],cache_path=path)
    first=s.get();published=first.items[0].published_at
    restored=AnnouncementService(provider=lambda a,b:pytest.fail('Cache should prevent fetch'),clock=lambda:now[0],cache_path=path)
    assert restored.get().cache_hit
    now[0]+=timedelta(seconds=601);s.provider=lambda a,b:result([],status='unavailable')
    stale=s.get();assert stale.status=='stale' and stale.items[0].stale
    assert stale.items[0].published_at==published and stale.items[0].fetched_at==NOW
    now[0]+=timedelta(days=8)
    assert s.get().items==[] and s.get().status=='unavailable'
    now[0]=NOW+timedelta(seconds=602+8*86400)
    s.provider=lambda a,b:result([item().model_copy(update={'fetched_at':now[0]})])
    now[0]+=timedelta(seconds=121)
    assert s.get().status=='ok' and not s.get().items[0].stale


def test_partial_failure_keeps_only_failed_company_cached_records():
    now=[NOW];s=AnnouncementService(provider=lambda a,b:result(),clock=lambda:now[0]);s.get()
    now[0]+=timedelta(seconds=601)
    r=result([]);r.coverage[1].status='unavailable'
    s.provider=lambda a,b:r
    current=s.get();assert current.status=='partial' and current.items[0].symbol=='TCS' and current.items[0].stale
    # A successful empty TCS response must clear its old records, not retain them forever.
    now[0]+=timedelta(seconds=121);s.provider=lambda a,b:result([])
    assert s.get().items==[]


def test_cache_coalesces_concurrent_requests_and_bad_disk_is_ignored(tmp_path):
    calls=[];path=tmp_path/'bad.json';path.write_text('not json')
    s=AnnouncementService(provider=lambda a,b:(calls.append(1) or result()),clock=lambda:NOW,cache_path=path)
    with ThreadPoolExecutor(max_workers=8) as pool: views=list(pool.map(lambda _:s.get(),range(8)))
    assert len(calls)==1 and all(len(v.items)==1 for v in views)


def test_rolling_window_expires_old_items_even_on_cache_hit():
    old=item(published=(NOW-timedelta(hours=24)).isoformat())
    now=[NOW];s=AnnouncementService(provider=lambda a,b:result([old]),clock=lambda:now[0])
    assert len(s.get(24).items)==1
    now[0]+=timedelta(seconds=1)
    assert not s.get(24).items and s.get(24).cache_hit

"""Live checks against local servers and original official documents; no test-price fixtures."""
import json
from datetime import datetime, timedelta
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlsplit


def get(url):
    with urlopen(url,timeout=100) as response:
        return response.status,json.load(response)


base='http://127.0.0.1:8000/api/announcements'
status,full=get(base+'?hours=720')
assert status==200 and full['status']=='ok', 'Official exchange availability is required for this live check.'
assert len(full['coverage'])==18 and all(c['status']=='available' for c in full['coverage'])
assert full['items'], 'No official filings returned; inspect source coverage rather than substituting data.'
counts={}
for hours in (24,168,720):
    code,view=get(base+f'?hours={hours}')
    assert code==200 and view['cache_hit']
    counts[hours]=len(view['items'])
    start=datetime.fromisoformat(view['window_start'].replace('Z','+00:00'))
    end=datetime.fromisoformat(view['window_end'].replace('Z','+00:00'))
    stamps=[datetime.fromisoformat(a['published_at'].replace('Z','+00:00')) for a in view['items']]
    assert all(start<=stamp<=end for stamp in stamps)
    assert stamps==sorted(stamps,reverse=True)
    assert len({a['id'] for a in view['items']})==len(view['items'])
assert counts[24]<=counts[168]<=counts[720]
_,proxy=get('http://127.0.0.1:3000/api/announcements?hours=720')
assert proxy['items']==full['items'] and proxy['last_attempt_at']==full['last_attempt_at']
for target,expected in [(base+'?hours=48',422),('http://127.0.0.1:3000/api/announcements?hours=48',400)]:
    try:
        get(target);raise AssertionError('Invalid period accepted')
    except HTTPError as exc:
        assert exc.code==expected
# Check a few original links really serve documents, not merely plausible-looking URLs.
checked=[]
for a in full['items'][:3]:
    assert urlsplit(a['filing_url']).hostname in {'nsearchives.nseindia.com','archives.nseindia.com','www.nseindia.com','www.bseindia.com','bseindia.com'}
    with urlopen(Request(a['filing_url'],headers={'User-Agent':'Mozilla/5.0'}),timeout=20) as response:
        header=response.read(100)
        assert response.status==200 and (header.startswith(b'%PDF') or b'<?xml' in header or b'<xbrl' in header), 'Original link did not return a PDF/XML filing.'
    checked.append({'symbol':a['symbol'],'title':a['title'],'published_at':a['published_at'],'filing_url':a['filing_url']})
print(json.dumps({'status':'ok','company_queries':18,'window_counts':counts,'cache_reused':True,'proxy_matches':True,'official_documents_checked':checked},indent=2))

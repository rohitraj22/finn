"""Live integration check. Asks two questions (up to four Gemini calls) using the backend's configured key."""
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError

def request(path, body=None):
    req=Request('http://127.0.0.1:3000/api/research/'+path,
                data=json.dumps(body).encode() if body else None,
                headers={'Content-Type':'application/json'})
    try:
        with urlopen(req,timeout=160) as response:return json.load(response)
    except HTTPError as exc:
        raise RuntimeError(f'HTTP {exc.code}: {exc.read().decode()}') from None

status=request('status')
assert status['documents_ready'] and status['api_key_configured'], 'Configure backend/.env and restart the backend.'
assert len(status['documents'])==2 and all(d['pages']>0 for d in status['documents'])
answer=request('ask',{'symbol':'TCS','question':'According to the October 2026 earnings call, what was cash conversion as a percentage of net income?'})
assert answer['status']=='answered', answer
assert answer['citations'] and all('#page=' in c['url'] for c in answer['citations'])
assert any('102.2' in c['quote'] for c in answer['citations']), answer
absent=request('ask',{'symbol':'TCS','question':'What exact revenue will TCS earn in the year 2045? Give a confirmed figure from the documents.'})
assert absent['status']=='insufficient_evidence' and not absent['claims'], absent
print('PASS: official documents indexed; live Gemini answer has verified page citations; unsupported future figure refused.')

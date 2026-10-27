"""Small synthetic passages exercise guardrails; live PDFs are checked separately."""
from io import BytesIO
import json
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from backend.main import create_app
from backend.research import (AskRequest, ResearchService, ResearchError, extract_pdf, retrieve,
                              validated_answer, gemini_answer)

DOC = {"id":"sample", "name":"Test annual report", "url":"https://www.bseindia.com/report.pdf", "kind":"Annual report", "period":"Test"}
CHUNK = {"id":"sample-p2-0", "document_id":"sample", "page":2,
         "text":"Revenue from banking services increased during the year. Operating cash flow was 120 crore."}
QUOTE = "Operating cash flow was 120 crore."

def supported():
    return {"supported":True,"claims":[{"text":QUOTE,"evidence":[{"chunk_id":CHUNK['id'],"quote":QUOTE}]}]}

@pytest.fixture
def service(tmp_path):
    manifest = tmp_path/'manifest.json'
    manifest.write_text(json.dumps({'TCS':{'name':'TCS','documents':[DOC]}}))
    s = ResearchService(tmp_path/'cache',manifest,generate=lambda *args:supported())
    s.indexes['TCS']={'chunks':[CHUNK],'documents':[DOC]}
    return s

def test_retrieval_and_unknown_question():
    other = {**CHUNK,'id':'other','text':'Employee training and hiring trends.'}
    assert retrieve('What was operating cash flow?', [other,CHUNK])[0] == CHUNK
    assert retrieve('quantum penguin spaceship', [CHUNK]) == []
    assert retrieve('the is a', [CHUNK]) == []

def test_citation_is_derived_from_source_not_model_url():
    r=validated_answer(supported(),[CHUNK],[DOC])
    assert r['claims'][0]['citations']==[1]
    assert r['citations'][0]['page']==2
    assert r['citations'][0]['url']==DOC['url']+'#page=2'
    assert r['citations'][0]['quote']==CHUNK['text']

@pytest.mark.parametrize('field,value',[('chunk_id','invented-p99')])
def test_rejects_fabricated_evidence(field,value):
    raw=supported();raw['claims'][0]['evidence'][0][field]=value
    with pytest.raises(ResearchError):validated_answer(raw,[CHUNK],[DOC])

def test_rejects_uncited_claims():
    raw=supported();raw['claims'][0]['evidence']=[]
    with pytest.raises(ResearchError):validated_answer(raw,[CHUNK],[DOC])

def test_abstention_discards_model_claims(service):
    service.generate=lambda *args: {'supported':False,'claims':[]}
    r=service.ask(AskRequest(question='What is revenue?'))
    assert r['status']=='insufficient_evidence' and not r['citations']

def test_no_retrieval_does_not_call_llm(service):
    service.generate=lambda *args: pytest.fail('No evidence should avoid an LLM call')
    assert service.ask(AskRequest(question='penguin spaceship'))['status']=='insufficient_evidence'

def test_api_success_missing_key_and_validation(service,monkeypatch):
    client=TestClient(create_app(research=service))
    monkeypatch.delenv('GEMINI_API_KEY',raising=False)
    status=client.get('/api/research/status').json()
    assert status['documents_ready'] and not status['api_key_configured']
    assert client.post('/api/research/ask',json={'question':'What is cash flow?'}).json()['status']=='answered'
    assert client.get('/api/research/status?symbol=UNKNOWN').status_code==404
    assert client.post('/api/research/ask',json={'question':'   '}).status_code==422
    assert client.post('/api/research/ask',json={'question':'x'*1001}).status_code==422
    service.generate=gemini_answer
    missing=client.post('/api/research/ask',json={'question':'What is cash flow?'})
    assert missing.status_code==503 and 'GEMINI_API_KEY' in missing.json()['error']

@pytest.mark.parametrize('status',[400,403,404,429,500])
def test_provider_errors_are_safe(status,monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY','test-secret-never-expose')
    with patch('backend.research.urlopen',side_effect=HTTPError('url',status,'test-secret-never-expose',{},None)):
        with pytest.raises(ResearchError) as e:gemini_answer('cash flow',[CHUNK],[DOC])
    assert 'test-secret' not in str(e.value)
    assert e.value.status == (429 if status==429 else 503)

def test_gemini_request_contract(monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY','test-secret')
    response=BytesIO(json.dumps({'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':json.dumps(supported())}]}}]}).encode())
    with patch('backend.research.urlopen',return_value=response) as call:
        assert gemini_answer('cash flow',[CHUNK],[DOC])['supported']
        request=call.call_args.args[0]
        assert 'test-secret' not in request.full_url
        assert request.get_header('X-goog-api-key')=='test-secret'
        body=json.loads(request.data)
        assert body['generationConfig']['responseMimeType']=='application/json'
        assert 'tools' not in body
        assert CHUNK['id'] in body['contents'][0]['parts'][0]['text']

def test_pdf_rejects_html_and_scanned_document():
    with pytest.raises(ValueError):extract_pdf(b'<html>Blocked</html>',DOC)
    writer=PdfWriter();writer.add_blank_page(width=100,height=100)
    buf=BytesIO();writer.write(buf)
    with pytest.raises(ValueError,match='No readable'):extract_pdf(buf.getvalue(),DOC)

def test_pdf_keeps_physical_page_numbers():
    class Page:
        def __init__(self,text):self.text=text
        def extract_text(self,**kwargs):return self.text
    class Reader:
        is_encrypted=False
        pages=[Page(''),Page(CHUNK['text'])]
    with patch('backend.research.PdfReader',return_value=Reader()):r=extract_pdf(b'%PDF-test',DOC)
    assert r['unreadable_pages']==[1]
    assert r['chunks'][0]['page']==2

def test_disk_cache_avoids_download(service):
    from hashlib import sha256
    service.indexes.clear();service.cache_dir.mkdir()
    fp=sha256(json.dumps(DOC,sort_keys=True).encode()).hexdigest()[:20]
    (service.cache_dir/f'{fp}-v1.json').write_text(json.dumps({'chunks':[CHUNK],'pages':2,'unreadable_pages':[]}))
    with patch('backend.research.urlopen',side_effect=AssertionError('network not expected')):
        assert service.prepare('TCS')['chunks']==[CHUNK]

def test_failed_source_is_unavailable_not_demo(service):
    service.indexes.clear()
    with patch('backend.research.urlopen',side_effect=OSError('offline')):
        status=service.status('TCS')
    assert not status['documents_ready'] and 'No sample' in status['error']

def test_transcript_scoping_and_pdf_ligatures():
    transcript={**DOC,'id':'call','kind':'Earnings-call transcript'}
    passage={**CHUNK,'id':'call-p6','document_id':'call','text':'Cash ﬂow conversion was strong at 102 percent of net income.'}
    hits=retrieve('cash flow in the earnings call',[CHUNK,passage],documents=[DOC,transcript])
    assert hits==[passage]
    r=validated_answer({'supported':True,'claims':[{'text':'Cash flow conversion was strong.',
        'evidence':[{'chunk_id':'call-p6','quote':'Cash flow conversion was strong'}]}]},hits,[DOC,transcript])
    assert r['status']=='answered'

def test_unverifiable_answer_retries_once_then_fails(service):
    calls=[]
    def bad(*args):
        calls.append(1)
        r=supported();r['claims'][0]['evidence'][0]['chunk_id']='invented'
        return r
    service.generate=bad
    with pytest.raises(ResearchError):service.ask(AskRequest(question='cash flow'))
    assert len(calls)==2


def test_model_cannot_supply_source_quote():
    raw=supported();raw['claims'][0]['evidence'][0]['quote']='Invented quotation from model'
    r=validated_answer(raw,[CHUNK],[DOC])
    assert r['citations'][0]['quote']==CHUNK['text']

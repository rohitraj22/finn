from io import BytesIO
from unittest.mock import patch
import pytest
from backend.research_discovery import discover

HTML = b'''<h1>Example Ltd</h1><a href="https://www.nseindia.com/get-quotes/equity?symbol=EXAMPLE">NSE</a><div><h3>Annual reports</h3><ul><li><a href="https://www.bseindia.com/report.pdf">Annual Report 2026</a></li></ul></div><div><h3>Concalls</h3><ul><li>Oct 2026<a href="https://www.bseindia.com/stockinfo/AnnPdfOpen.aspx?Pname=abc-123.pdf">Transcript</a></li></ul></div>'''

def test_primary_sources_and_transcript_resolution():
    with patch('backend.research_discovery.urlopen',return_value=BytesIO(HTML)):
        r=discover('EXAMPLE')
    assert len(r['documents'])==2
    assert r['documents'][1]['url'].endswith('/AttachHis/abc-123.pdf')

def test_identity_mismatch_rejected():
    with patch('backend.research_discovery.urlopen',return_value=BytesIO(HTML)):
        with pytest.raises(ValueError):discover('WRONG')

@pytest.mark.parametrize('symbol',['../TCS','http://localhost','bad ticker'])
def test_invalid_tickers(symbol):
    with pytest.raises(ValueError):discover(symbol)

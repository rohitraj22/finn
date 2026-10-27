"""Discover exchange-hosted primary documents through Screener's document directory."""
import re
from urllib.parse import quote, urlparse, parse_qs
from urllib.request import Request, urlopen
from bs4 import BeautifulSoup


def discover(symbol):
    if not re.fullmatch(r'[A-Z0-9&-]{1,20}', symbol):
        raise ValueError('Enter a valid NSE ticker.')
    url = f'https://www.screener.in/company/{quote(symbol, safe="")}/'
    with urlopen(Request(url, headers={'User-Agent':'Mozilla/5.0'}), timeout=25) as r:
        soup = BeautifulSoup(r.read(3_000_000), 'html.parser')
    # Require an NSE identity link, rather than trusting an arbitrary matching page.
    nse = [a.get('href','') for a in soup.select('a[href]') if urlparse(a.get('href','')).hostname == 'www.nseindia.com']
    if not any(parse_qs(urlparse(u).query).get('symbol') == [symbol] for u in nse):
        raise ValueError('Could not verify this NSE ticker in the source directory.')
    name = soup.find('h1').get_text(' ', strip=True)
    docs = []
    for heading, kind in [('Annual reports','Annual report'), ('Concalls','Earnings-call transcript')]:
        h = soup.find(lambda t: t.name in ('h2','h3') and t.get_text(strip=True) == heading)
        if not h:
            continue
        container = h.find_parent(class_='documents') or h.parent
        for a in container.select('a[href]'):
            label = a.get_text(' ', strip=True)
            link = a['href']
            host = urlparse(link).hostname
            if host not in ('www.bseindia.com','nsearchives.nseindia.com','archives.nseindia.com'):
                continue
            if not (('Annual Report' in label) if kind == 'Annual report' else label == 'Transcript'):
                continue
            if urlparse(link).path.lower().endswith('annpdfopen.aspx'):
                filename = parse_qs(urlparse(link).query).get('Pname',[''])[0]
                if not re.fullmatch(r'[a-fA-F0-9-]+\.pdf', filename): continue
                link = 'https://www.bseindia.com/xml-data/corpfiling/AttachHis/' + filename
            if not link.startswith('https://') or not urlparse(link).path.lower().endswith('.pdf'): continue
            period = a.find_parent('li').get_text(' ',strip=True) if a.find_parent('li') else label
            docs.append({'id':f'{symbol.lower()}-{len(docs)}', 'name':f'{name} — {label}', 'kind':kind,
                         'period':period[:100], 'url':link, 'discovered_at':url})
            break
    if not docs: raise ValueError('No exchange-hosted annual report or earnings transcript is currently available.')
    return {'name':name, 'documents':docs}

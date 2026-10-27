"""Official exchange filings, bounded downloads, per-company coverage and persistent caching."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from hashlib import sha256
from html import unescape
from html.parser import HTMLParser
from http.cookiejar import CookieJar
from pathlib import Path
from threading import Lock
from typing import Callable, Literal
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit, urlunsplit, quote
from urllib.request import Request, build_opener, HTTPCookieProcessor
from zoneinfo import ZoneInfo
import json
import logging
import re
import xml.etree.ElementTree as ET

from pydantic import BaseModel, Field, AwareDatetime
from backend.performance import HOLDINGS
from backend.announcement_rules import CATEGORIES, classify

IST = ZoneInfo('Asia/Kolkata')
SYMBOLS = tuple(h['symbol'] for h in HOLDINGS)
NAMES = json.loads((Path(__file__).resolve().parents[1] / 'data/announcement-companies.json').read_text())
NSE_PAGE = 'https://www.nseindia.com/companies-listing/corporate-filings-announcements'
NSE_API = 'https://www.nseindia.com/api/corporate-announcements'
RSS_URLS = {'NSE': 'https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml', 'BSE': 'https://www.bseindia.com/data/xml/announcements.xml'}
TTL = 600
RETRY_TTL = 120
MAX_STALE = timedelta(days=7)
logger = logging.getLogger(__name__)


def utc_now():
    return datetime.now(timezone.utc)


class Announcement(BaseModel):
    id: str
    symbol: str
    company_name: str
    title: str
    description: str
    source: Literal['NSE', 'BSE']
    source_method: Literal['NSE API', 'NSE RSS', 'BSE RSS']
    filing_url: str
    published_at: AwareDatetime
    timestamp_basis: str
    fetched_at: AwareDatetime
    categories: list[str]
    priority: Literal['High', 'Medium', 'Routine']
    priority_reason: str
    stale: bool = False


class Coverage(BaseModel):
    symbol: str
    status: Literal['available', 'partial', 'stale', 'unavailable']
    detail: str
    last_success_at: AwareDatetime | None = None


class SourceReport(BaseModel):
    source: str
    status: Literal['available', 'partial', 'unavailable', 'not_needed']
    detail: str
    url: str


class ProviderResult(BaseModel):
    items: list[Announcement]
    coverage: list[Coverage]
    sources: list[SourceReport]


class AnnouncementSnapshot(ProviderResult):
    schema_version: Literal[1] = 1
    status: Literal['ok', 'partial', 'stale', 'unavailable']
    last_attempt_at: AwareDatetime
    next_refresh_at: AwareDatetime
    queried_from: AwareDatetime
    queried_to: AwareDatetime
    cache_hit: bool = False
    window_hours: Literal[24,168,720] = 720
    window_start: AwareDatetime
    window_end: AwareDatetime
    categories: dict[str, str] = Field(default_factory=lambda: CATEGORIES.copy())
    error: str | None = None


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []
    def handle_data(self, data):
        self.parts.append(data)


def clean(value) -> str:
    if not isinstance(value, str):
        return ''
    parser = PlainText(); parser.feed(unescape(value))
    return re.sub(r'\s+', ' ', ' '.join(parser.parts)).strip()


def filing_url(value: str, source: str) -> str:
    if not isinstance(value, str):
        raise ValueError('Missing filing URL')
    parts = urlsplit(value.strip())
    domains = {'NSE': {'nsearchives.nseindia.com', 'archives.nseindia.com', 'www.nseindia.com'}, 'BSE': {'www.bseindia.com', 'bseindia.com'}}
    path_prefix = '/corporate/' if source == 'NSE' else '/xml-data/corpfiling/'
    if parts.scheme != 'https' or parts.hostname not in domains[source] or parts.username or parts.password or parts.port not in (None,443) or not parts.path.lower().startswith(path_prefix):
        raise ValueError('Filing link is not an official exchange attachment')
    return urlunsplit(('https', parts.netloc, quote(parts.path, safe='/%-._~'), parts.query, ''))


def exchange_time(value: str) -> datetime:
    if not isinstance(value,str) or not value.strip():
        raise ValueError('Missing exchange publication time')
    value = value.strip()
    dt = None
    for fmt in ('%d-%b-%Y %H:%M:%S', '%Y-%m-%d %H:%M:%S', '%d %b %Y %H:%M:%S'):
        try:
            dt = datetime.strptime(value, fmt); break
        except ValueError:
            pass
    if dt is None:
        try:
            dt = datetime.fromisoformat(value.replace('Z','+00:00'))
        except ValueError:
            dt = parsedate_to_datetime(value)
    if dt is None or (dt.hour == dt.minute == dt.second == 0 and len(value) <= 10):
        raise ValueError('Publication time unavailable')
    return (dt.replace(tzinfo=IST) if dt.tzinfo is None else dt).astimezone(IST)


def make_announcement(symbol, title, description, link, published, source, method, now, basis):
    title, description = clean(title), clean(description)
    if not title:
        raise ValueError('Missing announcement title')
    url = filing_url(link, source)
    categories, priority, reason = classify(title, description)
    # Exact attachment identity deduplicates the same filing exposed by API and RSS.
    identity = sha256(f'{source}|{symbol}|{url}'.encode()).hexdigest()[:24]
    return Announcement(id=f'{source.lower()}-{identity}',symbol=symbol,company_name=NAMES[symbol],title=title,
                        description=description,source=source,source_method=method,filing_url=url,published_at=published,
                        timestamp_basis=basis,fetched_at=now,categories=categories,priority=priority,priority_reason=reason)


def parse_nse(rows, symbol, start, end, now):
    if not isinstance(rows,list):
        raise ValueError('NSE did not return an announcement list')
    items, rejected = [], 0
    for row in rows:
        if not isinstance(row,dict) or row.get('symbol') != symbol:
            rejected += 1; continue
        try:
            stamp = row.get('exchdisstime') or row.get('an_dt')
            published = exchange_time(stamp)
            if not start <= published <= end:
                continue
            items.append(make_announcement(symbol,row.get('desc'),row.get('attchmntText'),row.get('attchmntFile'),published,
                                           'NSE','NSE API',now,'Exchange dissemination time' if row.get('exchdisstime') else 'Exchange announcement time'))
        except (ValueError,TypeError,OverflowError):
            rejected += 1
    return items, rejected


def normalized_name(value):
    value = re.sub(r'\(\d{6}\)\s*$', '', clean(value)).lower()
    value = re.sub(r'\b(limited|ltd)\b', '', value)
    return re.sub(r'[^a-z0-9]', '', value)

NAME_SYMBOLS = {normalized_name(name):symbol for symbol,name in NAMES.items()}


def parse_rss(raw, source, wanted, start, end, now):
    # Do not accept XML DTD/entity definitions from any upstream response.
    if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
        raise ValueError('Unexpected XML entity declarations')
    root = ET.fromstring(raw)
    if root.tag != 'rss' or root.find('channel') is None:
        raise ValueError('Exchange returned no RSS channel')
    items, rejected = [], 0
    for row in root.findall('./channel/item'):
        symbol = NAME_SYMBOLS.get(normalized_name(row.findtext('title')))
        if symbol not in wanted:
            continue
        try:
            published = exchange_time(row.findtext('pubDate'))
            if not start <= published <= end:
                continue
            description = clean(row.findtext('description'))
            if source == 'NSE' and '|SUBJECT:' in description:
                text, title = description.rsplit('|SUBJECT:',1)
            else:
                # BSE RSS has no separate subject: retain its full description as the title.
                title, text = description, ''
            items.append(make_announcement(symbol,title,text,row.findtext('link'),published,source,f'{source} RSS',now,'Exchange RSS publication time'))
        except (ValueError,TypeError,OverflowError):
            rejected += 1
    return items, rejected


def download(opener, url, referer, limit=4_000_000):
    request = Request(url,headers={'User-Agent':'Mozilla/5.0','Accept':'application/json, application/xml, text/html;q=0.8','Referer':referer})
    with opener.open(request,timeout=8) as response:
        raw = response.read(limit+1)
    if len(raw) > limit:
        raise ValueError('Exchange response exceeds size limit; coverage cannot be confirmed')
    return raw


def source_error(exc):
    if isinstance(exc, HTTPError):
        return f'Exchange HTTP {exc.code}; access blocked or temporarily unavailable.'
    return 'Exchange request failed, timed out, or returned an invalid response.'


def fetch_official(start: datetime, end: datetime) -> ProviderResult:
    jar = CookieJar()
    bootstrap = build_opener(HTTPCookieProcessor(jar))
    try:
        download(bootstrap,NSE_PAGE,NSE_PAGE)
    except Exception:
        # A blocked landing page doesn't prove the public JSON endpoint is blocked.
        pass
    cookies = list(jar)
    def fetch_company(symbol):
        company_jar = CookieJar()
        for cookie in cookies:
            company_jar.set_cookie(cookie)
        opener = build_opener(HTTPCookieProcessor(company_jar))
        url = NSE_API+'?'+urlencode({'index':'equities','symbol':symbol,'from_date':start.astimezone(IST).strftime('%d-%m-%Y'),'to_date':end.astimezone(IST).strftime('%d-%m-%Y')})
        try:
            rows = json.loads(download(opener,url,NSE_PAGE))
            items, rejected = parse_nse(rows,symbol,start,end,utc_now())
            detail = f'NSE 30-day query succeeded; {len(items)} filings in the rolling window.'
            if rejected:
                detail += f' {rejected} malformed records rejected; coverage is incomplete.'
            return items, Coverage(symbol=symbol,status='partial' if rejected else 'available',detail=detail,last_success_at=utc_now())
        except Exception as exc:
            return [], Coverage(symbol=symbol,status='unavailable',detail=source_error(exc))
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(fetch_company,SYMBOLS))
    items = [item for records,_ in results for item in records]
    coverage = [c for _,c in results]
    success = sum(c.status=='available' for c in coverage)
    sources = [SourceReport(source='NSE API',status='available' if success==18 else 'partial' if success else 'unavailable',detail=f'{success}/18 company queries completed without rejected records.',url=NSE_PAGE)]
    failed = {c.symbol for c in coverage if c.status!='available'}
    for source,url in RSS_URLS.items():
        if not failed:
            sources.append(SourceReport(source=f'{source} RSS',status='not_needed',detail='Primary NSE queries succeeded; fallback not needed.',url=url)); continue
        try:
            raw = download(build_opener(),url,NSE_PAGE if source=='NSE' else 'https://www.bseindia.com/',8_000_000)
            records,rejected = parse_rss(raw,source,failed,start,end,utc_now())
            items.extend(records)
            sources.append(SourceReport(source=f'{source} RSS',status='partial',detail=f'Official recent-items feed; {len(records)} matching filings. Not a complete 30-day archive. {rejected} invalid records rejected.',url=url))
            for c in coverage:
                if c.symbol in failed:
                    c.status='partial'
                    c.detail += f' {source} RSS checked; recent items only, longer history unverified.'
        except Exception as exc:
            sources.append(SourceReport(source=f'{source} RSS',status='unavailable',detail=source_error(exc),url=url))
    return ProviderResult(items=items,coverage=coverage,sources=sources)


class AnnouncementService:
    def __init__(self, provider: Callable = fetch_official, clock: Callable = utc_now, cache_path: Path | None = None):
        self.provider, self.clock, self.cache_path = provider, clock, cache_path
        self.lock = Lock()
        self.snapshot: AnnouncementSnapshot | None = None
        if cache_path and cache_path.exists():
            try:
                saved = AnnouncementSnapshot.model_validate_json(cache_path.read_text())
                if [c.symbol for c in saved.coverage] == list(SYMBOLS):
                    # Disk records receive the same provenance checks as network records.
                    for a in saved.items:
                        if a.symbol not in SYMBOLS or filing_url(a.filing_url,a.source)!=a.filing_url:
                            raise ValueError('Invalid cached filing')
                        a.categories, a.priority, a.priority_reason = classify(a.title,a.description)
                    self.snapshot = saved
            except (ValueError,OSError):
                logger.warning('Ignoring invalid announcement cache')

    def get(self, hours: Literal[24,168,720] = 720) -> AnnouncementSnapshot:
        with self.lock:
            now = self.clock()
            hit = bool(self.snapshot and now < self.snapshot.next_refresh_at)
            if not hit:
                start = now-timedelta(days=30)
                try:
                    result = self.provider(start,now)
                    if [c.symbol for c in result.coverage] != list(SYMBOLS):
                        raise ValueError('Incomplete company coverage metadata')
                except Exception:
                    logger.exception('Official announcements request failed')
                    result = ProviderResult(items=[],coverage=[Coverage(symbol=s,status='unavailable',detail='Official source requests failed; no complete query result.') for s in SYMBOLS],sources=[SourceReport(source='Exchanges',status='unavailable',detail='Official feed unavailable.',url=NSE_PAGE)])
                by_symbol = {c.symbol:c for c in result.coverage}
                # Retain only genuinely retrieved records, with their original fetch times.
                if self.snapshot:
                    for a in self.snapshot.items:
                        c = by_symbol[a.symbol]
                        if c.status!='available' and start <= a.published_at <= now and timedelta(0) <= now-a.fetched_at <= MAX_STALE:
                            result.items.append(a.model_copy(update={'stale':True}))
                    for c in result.coverage:
                        if c.status=='unavailable' and any(a.symbol==c.symbol for a in result.items):
                            c.status='stale'
                            c.detail+=' Previously retrieved official filings retained with original timestamps.'
                unique = {}
                for a in result.items:
                    if a.symbol not in SYMBOLS or not start <= a.published_at <= now:
                        continue
                    previous = unique.get(a.id)
                    if previous is None or (not a.stale, a.fetched_at) > (not previous.stale, previous.fetched_at):
                        unique[a.id] = a
                items = sorted(unique.values(),key=lambda a:(a.published_at,a.id),reverse=True)
                complete = all(c.status=='available' for c in result.coverage)
                any_fresh = any(c.status in ('available','partial') for c in result.coverage)
                status = 'ok' if complete else 'partial' if any_fresh else 'stale' if items else 'unavailable'
                checked = self.clock()
                self.snapshot = AnnouncementSnapshot(items=items,coverage=result.coverage,sources=result.sources,status=status,
                    last_attempt_at=checked,next_refresh_at=checked+timedelta(seconds=TTL if complete else RETRY_TTL),queried_from=start,queried_to=now,
                    window_start=start,window_end=now,error=None if complete else 'Some official feeds or requested history are unavailable. Coverage and retained data are labeled below.')
                if self.cache_path:
                    try:
                        self.cache_path.parent.mkdir(parents=True,exist_ok=True)
                        temporary=self.cache_path.with_suffix('.tmp')
                        temporary.write_text(self.snapshot.model_dump_json(indent=2));temporary.replace(self.cache_path)
                    except OSError:
                        logger.warning('Announcement disk cache unavailable; using memory cache')
            now=self.clock()
            start=now-timedelta(hours=hours)
            view=self.snapshot.model_copy(deep=True,update={'cache_hit':hit,'window_hours':hours,'window_start':start,'window_end':now})
            view.items=[a for a in view.items if start <= a.published_at <= now and now-a.fetched_at <= MAX_STALE]
            return view

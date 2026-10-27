# Official corporate announcements

Implemented for the existing 18-company portfolio. Alerts, Overview’s corporate-filing count, “On your radar”, and the navigation unread count share one announcement provider. Market data and portfolio calculations remain independent.

## Source selection and provenance

The primary source is the JSON feed used by [NSE’s corporate announcements page](https://www.nseindia.com/companies-listing/corporate-filings-announcements). The backend establishes a normal public-page cookie session and queries each portfolio symbol for a 30-day date range, with four bounded workers. It then applies exact timestamp boundaries locally. No authentication, CAPTCHA bypass, paid subscription or API key is used.

Live investigation returned successful NSE lists for all 18 companies. BSE’s public `AnnSubCategoryGetData/w` JSON endpoint returned HTTP 403. Both official RSS feeds were reachable:

- [NSE announcements RSS](https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml)
- [BSE announcements RSS](https://www.bseindia.com/data/xml/announcements.xml)

If a company’s NSE query fails or has rejected records, the backend checks these official RSS feeds for that company. They are **recent-items feeds, not complete 30-day archives**. RSS success is labeled partial coverage, even when it returns zero matching filings. In the observed feeds, NSE exposed only ten recent entries and BSE exposed the current overnight entries; neither contained these portfolio companies at that instant. This is why the UI never equates a fallback’s empty list with “no announcements exist.”

NSE rows must match the exact requested symbol. RSS company titles are matched to canonical exchange company names, normalized for punctuation and Limited/Ltd; there is no fuzzy name matching. Those names in `data/announcement-companies.json` were obtained from the live NSE responses for the portfolio symbols. Different companies and unrecognized aliases are excluded.

Each record retains the exchange subject, description, source, retrieval method, original publication timestamp and original filing URL. NSE’s dissemination timestamp is preferred; announcement time is used only when dissemination time is absent. Naive exchange/RSS times are interpreted as Asia/Kolkata, and explicit time zones are honored. Dates are displayed in IST. Fetch/check times are distinct from publication time.

Only HTTPS attachment links on explicitly allowed NSE/BSE hosts and filing paths are accepted. Invalid dates, missing titles, malformed records and unsupported links are rejected and disclosed as incomplete coverage. HTML is converted to plain text and React renders text safely. Exact attachment identities remove repeated copies from the same exchange/API/RSS. Distinct filings or exchange attachments are not merged using speculative semantic similarity.

## Categories and priority

`data/announcement-categories.json` contains the 17 categories adapted from the ENAM reference: Results, Management Changes, M&A, Dividends, Capex, Fundraising, Litigation & Regulation, Insider Trading, Earnings Calls, Investor Meetings, Credit Ratings, Bonus & Splits, Press Releases & Business Updates, Postal Ballots, AGM/EGM, Pledging and Other.

`backend/announcement_rules.py` checks the exchange’s subject and description. A filing can have multiple categories. Results, management changes, M&A, capex, fundraising and legal/regulatory matters receive High priority. Dividends, calls, ratings, pledges, insider dealings and business updates usually receive Medium (“Worth a look”). Meetings, shareholder notices and identified administrative filings receive Routine. Unmatched text receives Other / Medium rather than being silently dismissed. ESOP allotments are not treated as external fundraising; auditor appointments are not treated as executive changes. Call notices discussing financial results are categorized as Earnings Calls rather than actual results releases.

Labels are provisional keywords, **not conclusions about investment impact**. The exact rule rationale appears in expanded details. There is no AI summarization, PDF content analysis, financial-result extraction, management biography enrichment or research integration. The displayed description is the exchange’s text, not a generated summary.

## UI and filtering

The default period is the last 24 hours; 7-day and 30-day filters are available. All lists remain newest first, including priority and category filters. All updates includes routine records; the Routine tab isolates them. Long lists initially show 25 filings with Load more. “Mark visible as reviewed” marks only rendered records. Review state uses stable filing IDs in local storage, separate from the previous sample-alert IDs.

Overview displays the latest three filings from the same 24-hour window, links to the matching Alerts card, and shows the same window’s count. Navigation badges count unread filings in that window. Filtering and navigation reuse the 30-day snapshot; they do not trigger additional exchange requests. Time windows and expiry are re-evaluated every minute in an open browser.

Loading, genuine empty results, partial source coverage, unavailable feeds and retained stale records have distinct states. Source details disclose per-company failures, RSS limitations, original check time and next refresh. Old fictional announcements have been removed from the application. AI Research remains a clearly labeled demonstration.

## Caching and API

- `GET /api/announcements?hours=24|168|720` on FastAPI; default 720.
- Same path through Next.js on port 3000 is the same-origin proxy.
- Unsupported periods return 422 on FastAPI, 400 on the proxy.
- A complete successful snapshot caches for 10 minutes; partial/failing attempts retry after 2 minutes.
- A single lock coalesces concurrent misses; memory and atomic disk caching use `backend/.cache/announcements-v1.json`.
- On a company’s failed query, previously retrieved real filings may be retained for seven days from their original fetch, while remaining inside the selected publication window. They are explicitly stale. Successful empty queries clear the company’s previous records.
- A total outage without usable cached records returns 503. Partial coverage or retained records returns 200 with explicit status metadata. No mock fallback exists.
- Browsers timeout after 100 seconds, the proxy after 90, and each exchange download uses an eight-second socket timeout and response-size bounds. Run one local backend worker, as with the market-data service.
- Categories are reapplied to cached source text on backend restart, so rule fixes do not require refetching or changing a source’s publication/fetch timestamp.

## Verification

Automated tests cover all category families, multi-category records, timestamp conversion, exact period boundaries, future/expired records, source identity, official-link validation, empty vs unavailable states, RSS fallback limits, duplicates, concurrent cache reuse, disk loading, stale retention/recovery and partial failures. Existing market/portfolio tests remain intact.

Live verification retrieved 225 filings in the 30-day window, 61 in seven days, and 20 in 24 hours at the test time. All 18 NSE company queries succeeded. Three original attachments returned genuine PDF content with HTTP 200; frontend proxy records matched the backend and reused its cache. Counts naturally change over time.

```sh
npm run test:backend
npm run test:announcements
npm run test:market
npm run typecheck
npm run build
# With both local servers running:
backend/.venv/bin/python scripts/smoke_announcements.py
backend/.venv/bin/python scripts/smoke_market.py
```

The live smoke script requires current exchange availability and checks original documents, not merely plausible URLs. It never creates sample filings when sources fail. Browser checks cover desktop/mobile layouts, date/category/priority filters, filing details, reviewed state, empty results and outage/recovery behavior.

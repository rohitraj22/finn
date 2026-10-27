# Phase 2: end-of-day market data

Historical phase notes. The cost/return/chart boundary below is superseded by [Phase 3](portfolio-performance.md).

Implemented 28 October 2026. This supersedes the all-mock market-price behavior described in the foundation notes; alerts, research, historical performance and fictional returns remain unchanged in scope.

## Flow

Browser → same-origin Next.js `/api/market` → FastAPI `/api/market/portfolio` → shared memory/disk cache → yfinance daily-history batch for the 18 NSE symbols.

`backend/market.py` owns retrieval and calculations. Each quote carries a price, previous close, absolute/percentage change, session volume, average of the previous 20 trading bars, volume ratio, session dates, scheduled close, original fetch time, status, warnings, and source. A JSON snapshot is atomically persisted locally and is never committed. No mock market values enter this service.

Three months of history gives enough runway for 21 valid daily bars without assuming calendar days are trading days. The comparison excludes the selected session. Incomplete history and zero average volume produce nulls with explanations. Previous-session close must be valid; daily change is not fabricated by jumping over an invalid previous bar.

Today's bar is excluded before 16:00 IST. This prototype uses regular NSE session timing, with a 30-minute post-close buffer. It does not model exceptional trading calendars. The provider session date and actual request timestamp are distinct; the 15:30 time displayed alongside a daily date is explicitly a regular scheduled close, not a tick timestamp.

A live provider response during implementation included 27 October 2026 bars with missing `Close` values. The adapter now uses the last usable completed close, 26 October in that response, and displays a warning identifying the newer missing-close session. The chosen close and volume always belong to the same daily bar. The UI does not claim those prices are from 27 October.

## Cache and failure design

A successful full snapshot expires after 900 seconds. Partial/failing snapshots retry after 60 seconds; pre-close snapshots expire at the 16:00 eligibility boundary if sooner. A lock coalesces concurrent refresh requests. Disk persistence permits cache reuse across backend restarts. Run one worker; a multi-process/distributed cache is deliberately out of scope.

Partial failures preserve successfully fetched values per ticker. A failed refresh may retain real prior quotes for at most seven days after their original successful fetch. Retained values are labeled Stale and retain their original timestamps. Browser-side retained values obey the same bound. Missing quotes display Unavailable. Invalid disk caches are ignored; failed disk writes leave the in-memory cache usable. No fixture data is used as a fallback.

A first-fetch total failure is HTTP 503; partial data or usable stale quotes are HTTP 200 with explicit status metadata. Unsupported symbols are HTTP 404. The frontend exposes loading, timed-out, offline, missing and stale states and a retry control. Browser retries honor the backend cache rather than forcing downloads.

## Accounting boundary

The 18 fictional quantities and purchase costs are unchanged. The invested amount is still ₹27,64,300. Portfolio and holding values are labeled illustrative and calculated using fetched closes × fictional share quantities. Aggregate valuation is withheld if any price is missing or dates differ. Daily aggregate changes additionally require consistent previous-session dates.

Historical performance, total return, and per-holding returns retain their original mock values and explicit MOCK labels. They are not real performance reports or reconciled against new market values. No stock splits, corporate actions, dividends, transaction dates, fees, or cash flows are accounted for. Sector allocation uses fictional invested cost rather than mixing old mock prices with real quotes.

## Verification

- 15 deterministic Python tests cover calculations, prior-20-session averaging, intraday exclusion, weekends, insufficient/zero volume, invalid values, missing latest close, per-symbol failures, 503/404 handling, cache TTL, stale recovery/expiry, disk reuse/corruption, concurrency, and column orientation.
- 6 frontend data tests cover valuation, missing/mixed-session totals, absent previous close, payload validation, exact preservation of all 18 positions/costs, and browser stale expiry.
- Live HTTP checks: `/health` 200; portfolio 200 with 18 usable quotes; TCS 200; unknown symbol 404; Next.js proxy 200 with matching quote data.
- Repeated live requests used the same cached snapshot and original fetch timestamp. TCS volume ratio was independently checked against volume / average.
- Browser: loading state showed dashes (not fixtures); desktop/mobile Portfolio displayed actual fetched quotes, volumes and dates; TCS detail showed raw daily change, 20-session average, ratio, dates and the missing-close warning.
- Backend-offline checks: existing prices became Stale; a fresh page showed Unavailable with no quote-price fallback. Restoring the backend permits recovery using the saved real snapshot.
- `npm run typecheck` and `npm run build` passed. Next.js retains the existing Webpack production build configuration.

Tests use synthetic inputs only in test files. The live smoke command is `backend/.venv/bin/python scripts/smoke_market.py`, with both servers on their default local ports. Provider availability can vary; it is not a deterministic CI test.

## Reference APIs

- [yfinance download parameters](https://ranaroussi.github.io/yfinance/reference/api/yfinance.download.html): explicit daily interval, three-month lookback, raw Close with auto-adjust disabled, grouped ticker columns, bounded download threads and timeout.
- [FastAPI error handling](https://fastapi.tiangolo.com/tutorial/handling-errors/): explicit unsupported-symbol HTTP errors. Endpoint payload schemas are available at `/docs`.

AI research, corporate-announcement ingestion, monitoring rules, authentication, deployment, and trade execution are not implemented in this phase.

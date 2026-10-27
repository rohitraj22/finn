# Phase 3: historical demo portfolio

Historical phase notes. Announcements are now connected as described in [the next phase](corporate-announcements.md); the portfolio methodology below is unchanged.

Overview and Portfolio share the same FastAPI snapshot for prices, costs, values, returns, weights and historical performance. The existing visual design, navigation, 18 companies and quantities are retained. Alerts and AI Research remain demonstration features.

## Investment assumptions

The shared definition in `data/portfolio.json` records the unchanged hypothetical quantities and **1 October 2025** as the simulated purchase date. Each position's cost uses Yahoo's actual historical `Close` on that exact date. There is no fallback to the former invented costs and no shifting a missing purchase price to a different day.

This is a **price-only simulation**, not actual investor returns or a transaction ledger. Quantities are fixed in the split-adjusted share units underlying Yahoo's historical Close series. Historical split adjustments are inherited from the provider; the application does not apply splits a second time. Dividends, distributions, demerger entitlements, fees, taxes and subsequent cash flows are excluded. `Adj Close` and dividend-reinvestment returns are not used. Future provider revisions to historical prices can change the simulation; the purchase date and quantities stay fixed.

The financial pages carry one concise disclosure: **Demo portfolio — hypothetical holdings, real market data.** The purchase date and price-return exclusions appear alongside market freshness; holding details explain the share basis and distinguish simulated performance from actual returns.

## Calculations and precision

- Normalize closing prices to INR paise, removing provider floating-point artifacts. Displayed price × quantity therefore reconciles with the holding value.
- Position cost = purchase-date close × quantity.
- Position value = displayed EOD close × quantity.
- Profit/loss = value − cost; percentage return = profit/loss ÷ cost × 100.
- Portfolio invested capital, value and profit/loss are sums across all 18 positions, rounded to paise. Percentage return uses aggregate cost, not the average of company returns.
- Company weight = holding value ÷ total value × 100. The sector donut aggregates these current values, not invested costs.
- Daily portfolio change compares complete current and previous session valuations; daily percentage uses the previous valuation.
- Chart value on each observed session = sum of that session's historical closes × unchanged quantities, using the same precision as the table. Its ending valuation agrees with the Overview and Portfolio total when all prices are available.
- Percentages and weights retain full precision in the API and are rounded only for display. Displayed percentages can have small rounding differences when summed.

## Chart windows and missing data

1W, 1M, 3M and 1Y use calendar offsets from the latest available quoted session. For a non-trading boundary, the baseline is the last observed session on or before that boundary. The chart shows the actual start and end dates. Its return compares those two endpoints; it is neither annualized nor necessarily the same as the since-purchase return.

History starts at the purchase date. The provider's observed session dates form the series; no synthetic weekend or holiday bars are inserted. If any company lacks a valid close on an observed date, that portfolio point is **null**, includes the missing symbols, and appears as a gap. The SVG line and area stop at gaps. There is no forward fill, interpolation, zero-price substitution or mock history.

If the baseline or endpoint is missing, or history does not extend back to the requested window, period return is unavailable. A gap inside an otherwise valid window does not invalidate the independently observed endpoint return. Missing purchase prices suppress the affected holding's cost/return and aggregate invested capital/return; unrelated prices and usable chart periods can still display. Missing or mixed-session current quotes suppress total valuation and weights. Previous-session inconsistencies suppress daily aggregate changes.

## Retrieval and cache

One yfinance batch requests daily history from the purchase date with `auto_adjust=False`, `back_adjust=False`, `repair=False`, and `keepna=True`. Both quote and historical calculations use that batch. Today's bar remains excluded until 16:00 IST. A newer unusable close is reported explicitly, with the last valid close retaining its actual date.

The version-2 response adds `performance` to `/api/market/portfolio` and the existing Next.js `/api/market` proxy. No new service or AI API is required. History and valuation are cached atomically with quotes in `backend/.cache/market-v2.json`; the older quote-only cache is not loaded. The cache validates the current purchase date and quantities. Successful complete results cache for 15 minutes; partial prices or purchase history retry after 60 seconds. Internal historical gaps remain visible even when a snapshot is otherwise complete.

On a total provider failure, the previous coherent performance snapshot can be retained for up to seven days from its original fetch, labeled **Stale**. It is never re-dated. Partial failures do not splice cached history into newly fetched history. Frontend fetch failures mark retained performance stale; expired underlying prices suppress valuation rather than leaving a misleading total. Loading and unavailable states have no mock fallback.

## Verification

Deterministic Python tests cover cost, gains/losses, flat returns, allocation, rounding, all four period boundaries, non-trading boundaries, missing purchase/end/baseline/interior prices, missing tickers, insufficient history, intraday exclusion, atomic caching, stale recovery and expiry. Existing endpoint and quote/volume tests are retained. Frontend tests cover response validation, unchanged quantities without fixture prices/costs, stale expiry and segmented chart gaps.

Live testing fetched all 18 purchase prices. At the 26 October 2026 closing session, the simulation had ₹28,46,192.00 invested, ₹26,45,651.00 value and −₹2,00,541.00 price P/L (−7.05%). Yahoo's newer 27 October closes were unavailable and were not invented. The one-year series had one missing session: CERA on 15 January 2026. The UI showed its gap explicitly.

`scripts/smoke_market.py` checks the live API/proxy, cache reuse, all position sums, costs against purchase prices, weights, daily quote/volume math, and all chart endpoints/returns. Browser verification covers desktop and mobile layouts, period switches, holdings and detail dialogs. Run instructions and commands are in the project README.

Reference: [yfinance download API](https://ranaroussi.github.io/yfinance/reference/api/yfinance.download.html).

# Configurable EOD alerts

Alerts contains an expandable Alert Settings panel with separate positive daily-increase and daily-decrease thresholds (defaults 5% each) and a volume multiplier (default 2×). Settings apply to all 18 demo holdings and persist atomically in `backend/.state/alert-settings.json`, outside the market-data cache. `FINN_STATE_DIR` can override this directory. These are shared preferences for this local single-user prototype.

The backend reuses `MarketService.get()` and its existing completed-session, cache and missing-data rules; no additional yfinance download or Gemini call is introduced. A positive price change must strictly exceed the increase threshold; a negative move must fall strictly below the negative decrease threshold. Volume must strictly exceed the configured multiple of the previous 20 trading sessions' mean, excluding the evaluated session. Missing/zero denominators and insufficient history never generate volume alerts.

Only available quotes matching the snapshot's latest market date are evaluated. Stale and older-session quotes are excluded and incomplete coverage is reported. The existing provider excludes today's bar until 16:00 IST under its regular-session policy; special-session exchange calendars are not modeled. The displayed date is the latest available completed session, not a real-time timestamp.

Alerts and Overview display company, actual change/volume, crossed threshold, session date and a neutral explanation. Signals are deterministic current-session evaluations, not a notification history: the ID is company + condition + session, so refreshes, restarts and threshold changes do not create duplicate cards. Changing thresholds immediately reevaluates the current session. There is no push notification, email, background scheduler or monitoring while the app is closed. Open pages recheck when the existing market snapshot refreshes.

Endpoints: `GET /api/price-alerts` and `PUT /api/price-alerts` on FastAPI and the same-origin Next.js proxy. PUT accepts `price_up_percent`, `price_down_percent`, and `volume_multiple`; all must be finite positive values. Prices and corporate filing alerts remain separate, clearly labeled sections.

Verification: 11 focused tests cover strict thresholds, up/down/volume crossings, stable identities, persistence, invalid preferences and stale/missing data. TypeScript checks passed.

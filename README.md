# FINN — Financial Investment Agent

A mobile-first Next.js / React / TypeScript frontend with a Python FastAPI backend for an 18-company Indian equity demo portfolio.

**Demo portfolio — hypothetical holdings, real market data.** This is a research prototype, not investment advice or a trading service.

## Features

- End-of-day prices and volume from Yahoo Finance through yfinance.
- Historical portfolio cost, value, returns, weights and performance charts.
- Real NSE announcements with official RSS fallback and original filing links.
- Bounded Gemini announcement analysis with labeled AI insights and rule-based fallback.
- Configurable EOD price/volume thresholds and duplicate-free current-session signals.
- On-demand company-document research with Gemini, source excerpts and PDF page citations.

## Run locally

Requires Node.js 24 and Python 3.14 (the pinned backend dependencies were tested with 3.14).

```sh
npm ci
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-lock.txt
```

Copy `backend/.env.example` to `backend/.env` **only if it does not already exist**, then set `GEMINI_API_KEY` there. The model defaults to `gemini-3.1-flash-lite`. Never put secrets in `NEXT_PUBLIC_` variables or commit `.env` files.

Run in separate terminals:

```sh
npm run dev:backend
npm run dev
```

Open [FINN locally](http://127.0.0.1:3000). Restart the backend after editing its environment file. Market data does not need an API key. AI features require an eligible Gemini project and available quota.

## Free deployment

[Deployment instructions](docs/deployment.md) explain the GitHub → Render workflow. `render.yaml` specifies the **Free** plan. `Dockerfile` builds both existing services; only Next.js is exposed publicly and it proxies API requests to FastAPI internally. No separate frontend/backend URL setup is needed.

**Free hosting limitations:** Render sleeps idle services and erases local state on sleep, restart or redeploy. Saved thresholds, source indexes, caches and AI request counters therefore reset. Cold starts and PDF processing can be slow; large reports can exceed free-instance memory. This is a public demo deployment, not durable production infrastructure. The app has shared settings and no user accounts. All visitors share AI quota; the deployment limits Gemini to 60 attempts per day, but counters also reset when ephemeral storage is lost. Use an unbilled Gemini project to avoid API charges.

Deployment status and public/repository URLs must be recorded only after actual publication; none are assumed by this configuration.

## Configuration

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Backend runtime secret, supplied in the hosting dashboard |
| `FINN_RESEARCH_MODEL` | Gemini model, default `gemini-3.1-flash-lite` |
| `FINN_BACKEND_URL` | Next.js server-only backend URL; container fixes this to loopback |
| `FINN_CACHE_DIR` | Market, filing, PDF and AI cache directory |
| `FINN_STATE_DIR` | Saved thresholds and deployment AI request counter |
| `FINN_GEMINI_DAILY_LIMIT` | Global attempt cap; Render defaults to 60, unset locally means unlimited |
| `PORT` | Hosting-assigned public Next.js port |

For Docker, directories default to `/app/storage/cache` and `/app/storage/state`. An external persistent volume can preserve these if a future host supports it. Run only one container/worker with file-based state.

## Checks

```sh
npm run typecheck
npm run build
npm run test:backend
npm run test:market
npm run test:announcements
```

Focused deployment checks:

```sh
backend/.venv/bin/python -m pytest backend/tests/test_deployment.py backend/tests/test_research.py -q
python3 scripts/check_deployment.py https://YOUR-SERVICE.onrender.com
```

The deployment check is read-only and does not alter preferences or submit AI questions. Live Gemini checks must be performed separately and consume quota. The GitHub workflow builds Next.js and the Docker image and runs targeted backend checks; it needs no production secrets.

## Project guide

- `app/`, `components/`, `lib/`: frontend pages, shared UI and contracts.
- `backend/`: FastAPI services, calculations, retrieval, AI and tests.
- `data/`: demo holdings, ENAM category names and curated source metadata.
- `deploy/`, `Dockerfile`, `render.yaml`: production startup and hosting configuration.
- [Portfolio calculations](docs/portfolio-performance.md)
- [Corporate announcement sources](docs/corporate-announcements.md)
- [AI filing analysis](docs/ai-alerts.md)
- [Price/volume alerts](docs/price-volume-alerts.md)
- [Document research](docs/ai-research.md)

No fabricated prices or filings replace source failures. Retrieval coverage and AI limitations are disclosed in the UI. Historical phase notes under `docs/` describe earlier development stages.

# AI insights for corporate filings

Alerts and Overview share one optional AI-insight layer. Original exchange titles, descriptions, publication times and filing URLs remain unchanged. AI category/importance labels override rule labels only when a validated analysis is available; both label types are visibly identified. High/Medium items sort before Routine, then newest first. Routine card bodies are collapsed until expanded.

The backend selects up to 12 recent non-stale NSE announcements from the last seven days, using rule priority and recency only for initial selection. Selection is persisted per UTC day. Selected documents are analyzed in a single background worker, leaving feed/portfolio requests responsive. Other announcements use the Analyze with AI button. Automatic failures are not retried repeatedly; on-demand retries honor a 30-minute failure cooldown. No key means no model calls.

Each analysis downloads the original official PDF, extracts page text using the existing research extractor, and sends selected passages plus exchange metadata to the existing Gemini transport. The prompt uses all 17 ENAM categories and separates actual significance from category/keywords (for example, a results publication notice may be Routine). The requested output is a 1–2 sentence factual summary and investor relevance, importance, category, reasoning and evidence IDs. Invalid categories, unknown evidence IDs, missing support and new numeric figures are rejected. PDF/download/extraction/model errors retain rule-based labels; no substitute summary is created.

Evidence excerpts and page links come from the index, not generated quotations. Source IDs and numeric checks do not prove semantic accuracy; AI interpretation is explicitly labeled and original filings remain the authority. Only selected PDF passages are considered, and scanned content/images are not OCR'd. Downloads are limited to 12 MB. Large/unreadable filings can be unavailable for AI even when the original link works.

PDFs, page indexes and insights persist in `backend/.cache/announcement-ai/`. Insight keys include announcement identity, title/description, filing URL, model and prompt version. No extra API key is needed: `GEMINI_API_KEY` and `FINN_RESEARCH_MODEL` in `backend/.env` are reused. Research and portfolio calculations are unchanged.

Endpoints (also proxied by Next.js):
- `GET /api/announcements/insights`: cached insight states and bounded automatic queue.
- `POST /api/announcements/{id}/analyze`: queue one known portfolio filing; arbitrary URLs are not accepted.

Run focused tests with `backend/.venv/bin/python -m pytest backend/tests/test_announcement_ai.py backend/tests/test_research.py -q`.

Verified on 28 October 2026: the live bounded batch completed with 10 available insights and two rule-based fallbacks. Original PDF evidence confirmed the distinction between Maruti's proposed nonprofit subsidiary (Medium) and L&T's recording notice (Routine). Twenty-eight focused AI-alert/research tests and TypeScript checks passed. Next.js proxies expose the shared cached insight map to Alerts and Overview; repeated on-demand requests reuse the original analysis timestamp.

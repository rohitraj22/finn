from pathlib import Path
from backend.announcements import AnnouncementService, AnnouncementSnapshot
import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from backend.market import MarketService, SYMBOLS, Snapshot, Quote
from backend.research import ResearchService, ResearchError, AskRequest
from backend.price_alerts import PriceAlerts, AlertSettings
from dotenv import load_dotenv
from backend.announcement_ai import AnnouncementAI

load_dotenv(Path(__file__).parent / ".env", override=False)


def create_app(service: MarketService | None = None, announcements: AnnouncementService | None = None,
               research: ResearchService | None = None) -> FastAPI:
    app = FastAPI(title="FINN", version="0.5.0")
    cache_dir = Path(os.environ.get("FINN_CACHE_DIR", Path(__file__).parent / ".cache"))
    market = service or MarketService(cache_path=cache_dir / "market-v2.json")
    app.state.market = market
    price_alerts = PriceAlerts(Path(os.getenv("FINN_STATE_DIR", Path(__file__).parent / ".state")) / "alert-settings.json")

    @app.get("/api/price-alerts")
    def eod_alerts():
        try:
            return JSONResponse(price_alerts.evaluate(market.get()), headers={"Cache-Control":"no-store"})
        except (OSError, ValueError):
            raise HTTPException(503, "Alert settings could not be read. Check the backend state file.")

    @app.put("/api/price-alerts")
    def save_alert_settings(settings: AlertSettings):
        try:
            return price_alerts.save(settings)
        except OSError:
            raise HTTPException(503, "Alert settings could not be saved.")

    filings = announcements or AnnouncementService(cache_path=cache_dir / "announcements-v1.json")
    app.state.announcements = filings
    insights = AnnouncementAI(cache_dir / "announcement-ai")
    app.state.announcement_ai = insights

    @app.get("/api/announcements/insights")
    def announcement_insights():
        return JSONResponse(insights.snapshot(filings.get(720).items), headers={"Cache-Control":"no-store"})

    @app.post("/api/announcements/{filing_id}/analyze")
    def analyze_announcement(filing_id: str):
        items = filings.get(720).items
        item = next((a for a in items if a.id == filing_id), None)
        if item is None:
            raise HTTPException(404, "Filing is not in the current portfolio feed.")
        insights.schedule(item)
        return JSONResponse(insights.snapshot([item], automatic=False), headers={"Cache-Control":"no-store"})

    research_service = research or ResearchService(cache_dir / "research")
    app.state.research = research_service

    @app.exception_handler(ResearchError)
    async def research_error_handler(request, exc):
        return JSONResponse({"error": str(exc)}, status_code=exc.status, headers={"Cache-Control": "no-store"})

    @app.get("/api/research/status")
    def research_status(symbol: str = "TCS"):
        return JSONResponse(research_service.status(symbol), headers={"Cache-Control": "no-store"})

    @app.post("/api/research/ask")
    def research_ask(request: AskRequest):
        return JSONResponse(research_service.ask(request), headers={"Cache-Control": "no-store"})

    @app.get("/api/announcements", response_model=AnnouncementSnapshot, responses={503: {"model": AnnouncementSnapshot}})
    def announcement_feed(hours: int = 720):
        if hours not in (24,168,720):
            raise HTTPException(status_code=422,detail="Choose 24, 168 or 720 hours.")
        result = filings.get(hours)
        return JSONResponse(result.model_dump(mode="json"),status_code=503 if result.status == "unavailable" else 200,
                            headers={"Cache-Control":"no-store"})


    @app.get("/health")
    def health():
        return {"status": "ok", "service": "finn-market", "portfolio_symbols": len(SYMBOLS)}

    @app.get("/api/market/portfolio", response_model=Snapshot, responses={503: {"model": Snapshot}})
    def portfolio():
        result = market.get()
        return JSONResponse(
            result.model_dump(mode="json"), status_code=503 if result.status == "unavailable" else 200,
            headers={"Cache-Control": "no-store", "Retry-After": str(max(1, int((result.next_refresh_at - market.clock()).total_seconds())))},
        )

    @app.get("/api/market/stocks/{symbol}", response_model=Quote, responses={503: {"model": Quote}})
    def stock(symbol: str):
        symbol = symbol.upper()
        if symbol not in SYMBOLS:
            raise HTTPException(status_code=404, detail="Symbol is not in the FINN portfolio.")
        snapshot = market.get()
        quote = next(q for q in snapshot.quotes if q.symbol == symbol)
        return JSONResponse(quote.model_dump(mode="json"), status_code=503 if quote.close is None else 200,
                            headers={"Cache-Control": "no-store"})

    return app


app = create_app()

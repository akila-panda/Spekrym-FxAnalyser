"""Run: uvicorn api.main:app --port 8000   (needs DATABASE_URL, see .env.example)"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.datasource import CandleSource, PgSource
from api.routes import router


def create_app(source: CandleSource | None = None) -> FastAPI:
    app = FastAPI(title="Spekrym-FX Strategy Scanner API", version="0.1.0")
    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"],
                       allow_methods=["GET", "POST"], allow_headers=["*"])
    app.state.source = source or PgSource()
    app.include_router(router)

    @app.get("/api/health")
    async def health():
        return {"ok": True}

    return app


app = create_app()
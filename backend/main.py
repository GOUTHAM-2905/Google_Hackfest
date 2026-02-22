"""
Turgon — Intelligent Data Dictionary Agent
FastAPI application entry point.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import health, ingest, profile, generate, chat, export_doc, connections, lineage, alerts, changes, plot
from config import settings

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("turgon")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Turgon starting up…")
    yield
    logger.info("Turgon shutting down.")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Turgon — Intelligent Data Dictionary Agent",
    description="AI-powered, on-premise data dictionary generation and chat.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(health.router,      prefix="/api")
app.include_router(ingest.router,      prefix="/api")
app.include_router(profile.router,     prefix="/api")
app.include_router(generate.router,    prefix="/api")
app.include_router(chat.router,        prefix="/api")
app.include_router(export_doc.router,  prefix="/api")
app.include_router(connections.router, prefix="/api")
app.include_router(lineage.router,     prefix="/api")
app.include_router(alerts.router,      prefix="/api")
app.include_router(changes.router,     prefix="/api")
app.include_router(plot.router,        prefix="/api")

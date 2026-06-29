"""Microservice de calcul SATCOM. Source unique de verite physique pour les
clients Unity / Unreal / HTML / Ventuz, qui ne consomment que des LinkResult.

Lancer :  uvicorn app.main:app --reload
Docs interactives :  http://127.0.0.1:8000/docs
"""
from __future__ import annotations
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from .models import LinkRequest, ScenarioRequest, LinkResult
from . import engine

app = FastAPI(title="SATCOM Coverage Engine", version="0.1.0",
              description="Moteur GEO+LEO de bilan de liaison et planification de couverture.")

# CORS : un client navigateur (HTML/Ventuz web) tape l'API depuis une autre origine.
# En prod, restreindre via CORS_ORIGINS="https://app.exemple.fr,https://..."
_origins = os.environ.get("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "satcom-coverage-engine", "version": "0.1.0"}


@app.post("/link", response_model=LinkResult, summary="Liaison GEO instantanee")
def link(req: LinkRequest):
    """Bilan de liaison vers un satellite GEO (Syracuse, Inmarsat GX...).
    Geometrie figee + chaine RF portee de la feuille Master."""
    return engine.compute_geo_link(req)


@app.post("/scenario", summary="Scenario LEO dynamique")
def scenario(req: ScenarioRequest):
    """Propage une constellation LEO (TLE reels ou Walker type Amazon Leo) sur une
    fenetre temporelle : visibilite, handover, bilan RF par pas, disponibilite %."""
    return engine.run_leo_scenario(req)


# --- Clients web statiques (timeline / scenarios / coverage3d) ---
# Montes a /ui ; meme origine que l'API (pas de CORS pour les clients servis ici).
_CLIENT_DIR = os.path.join(os.path.dirname(__file__), "..", "client")
if os.path.isdir(_CLIENT_DIR):
    @app.get("/", include_in_schema=False)
    def _root():
        return RedirectResponse("/ui/")

    app.mount("/ui", StaticFiles(directory=_CLIENT_DIR, html=True), name="ui")

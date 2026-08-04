from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parents[3]
PACK_PATH = ROOT / "data" / "world" / "pack.v1.json"

app = FastAPI(title="Football Manager World API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache
def load_pack() -> dict:
    if not PACK_PATH.exists():
        raise FileNotFoundError(PACK_PATH)
    return json.loads(PACK_PATH.read_text(encoding="utf-8"))


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/world/pack")
def world_pack() -> dict:
    """Full world pack: leagues, clubs, continental access rules."""
    return load_pack()


@app.get("/world/meta")
def world_meta() -> dict:
    pack = load_pack()
    return {
        "version": pack["version"],
        "season": pack["season"],
        "federationCount": len(pack["federations"]),
        "clubCount": len(pack["clubs"]),
        "leagueCount": len(pack["leagues"]),
    }


@app.get("/world/access/{federation_id}")
def continental_access(federation_id: str, season: str | None = None) -> dict:
    pack = load_pack()
    season = season or pack["season"]
    fed = next((f for f in pack["federations"] if f["id"] == federation_id), None)
    if not fed:
        raise HTTPException(404, f"Unknown federation {federation_id}")

    rules = [
        r
        for r in pack["continentalAccess"]
        if r["federationId"] == federation_id and _applies(r, season)
    ]
    rules.sort(key=lambda r: r["range"]["fromSeason"], reverse=True)
    allowed = rules[0]["allowed"] if rules else True
    return {
        "federationId": federation_id,
        "season": season,
        "allowed": allowed,
        "activeRule": rules[0] if rules else None,
    }


def _season_key(season: str) -> int:
    return int(season[:4])


def _applies(rule: dict, season: str) -> bool:
    s = _season_key(season)
    frm = _season_key(rule["range"]["fromSeason"])
    to = rule["range"]["toSeason"]
    if s < frm:
        return False
    if to is not None and s > _season_key(to):
        return False
    return True

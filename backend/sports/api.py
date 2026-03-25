"""API-Football client with in-memory caching.

Wraps the API-Football v3 REST API for live scores, upcoming fixtures,
and league standings. Free tier: 100 requests/day, 10/min.

Cache TTLs prevent burning through the quota:
  - Standings: 1 hour
  - Upcoming fixtures: 15 minutes
  - Live scores: 1 minute
  - Head to head: 1 hour
"""
import time

import httpx

from config import FOOTBALL_API_KEY

API_BASE = "https://v3.football.api-sports.io"

# Simple in-memory cache: key → (data, expiry_timestamp)
_cache: dict[str, tuple[dict, float]] = {}


def _cache_get(key: str) -> dict | None:
    if key in _cache:
        data, expiry = _cache[key]
        if time.time() < expiry:
            return data
        del _cache[key]
    return None


def _cache_set(key: str, data: dict, ttl: int):
    _cache[key] = (data, time.time() + ttl)


def _api_get(endpoint: str, params: dict, cache_ttl: int = 900) -> dict | None:
    """Call API-Football with caching and error handling."""
    if not FOOTBALL_API_KEY:
        return None

    cache_key = f"{endpoint}:{sorted(params.items())}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    try:
        response = httpx.get(
            f"{API_BASE}/{endpoint}",
            params=params,
            headers={"x-apisports-key": FOOTBALL_API_KEY},
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("errors") and len(data["errors"]) > 0:
            print(f"  API-Football error: {data['errors']}")
            return None

        _cache_set(cache_key, data, cache_ttl)
        return data
    except Exception as e:
        print(f"  API-Football request failed: {e}")
        return None


def get_upcoming_fixtures(team_id: int, next_count: int = 3) -> list[dict]:
    """Get next N upcoming matches for a team."""
    data = _api_get("fixtures", {"team": team_id, "next": next_count}, cache_ttl=900)
    if not data:
        return []

    fixtures = []
    for f in data.get("response", []):
        fixture = f.get("fixture", {})
        teams = f.get("teams", {})
        league = f.get("league", {})
        goals = f.get("goals", {})

        fixtures.append({
            "id": fixture.get("id"),
            "date": fixture.get("date"),
            "venue": (fixture.get("venue") or {}).get("name", ""),
            "status": (fixture.get("status") or {}).get("short", "NS"),
            "elapsed": (fixture.get("status") or {}).get("elapsed"),
            "league": league.get("name", ""),
            "league_logo": league.get("logo", ""),
            "round": league.get("round", ""),
            "home_team": (teams.get("home") or {}).get("name", ""),
            "home_logo": (teams.get("home") or {}).get("logo", ""),
            "away_team": (teams.get("away") or {}).get("name", ""),
            "away_logo": (teams.get("away") or {}).get("logo", ""),
            "score_home": goals.get("home"),
            "score_away": goals.get("away"),
        })

    return fixtures


def get_standings(league_id: int, season: int = 2024) -> list[dict]:
    """Get league standings table."""
    data = _api_get("standings", {"league": league_id, "season": season}, cache_ttl=3600)
    if not data:
        return []

    standings = []
    for league_data in data.get("response", []):
        for group in league_data.get("league", {}).get("standings", []):
            for team in group:
                standings.append({
                    "rank": team.get("rank"),
                    "team": team.get("team", {}).get("name", ""),
                    "logo": team.get("team", {}).get("logo", ""),
                    "played": team.get("all", {}).get("played", 0),
                    "won": team.get("all", {}).get("win", 0),
                    "drawn": team.get("all", {}).get("draw", 0),
                    "lost": team.get("all", {}).get("lose", 0),
                    "gf": team.get("all", {}).get("goals", {}).get("for", 0),
                    "ga": team.get("all", {}).get("goals", {}).get("against", 0),
                    "gd": team.get("goalsDiff", 0),
                    "points": team.get("points", 0),
                    "form": team.get("form", ""),
                })

    return standings


def get_live_scores() -> list[dict]:
    """Get all currently live matches."""
    data = _api_get("fixtures", {"live": "all"}, cache_ttl=60)
    if not data:
        return []

    return [
        {
            "id": f.get("fixture", {}).get("id"),
            "status": (f.get("fixture", {}).get("status") or {}).get("short", ""),
            "elapsed": (f.get("fixture", {}).get("status") or {}).get("elapsed"),
            "league": f.get("league", {}).get("name", ""),
            "home_team": (f.get("teams", {}).get("home") or {}).get("name", ""),
            "home_logo": (f.get("teams", {}).get("home") or {}).get("logo", ""),
            "away_team": (f.get("teams", {}).get("away") or {}).get("name", ""),
            "away_logo": (f.get("teams", {}).get("away") or {}).get("logo", ""),
            "score_home": f.get("goals", {}).get("home"),
            "score_away": f.get("goals", {}).get("away"),
        }
        for f in data.get("response", [])
    ]


def get_head_to_head(team1_id: int, team2_id: int, last: int = 5) -> list[dict]:
    """Get last N head-to-head matches between two teams."""
    data = _api_get("fixtures/headtohead", {"h2h": f"{team1_id}-{team2_id}", "last": last}, cache_ttl=3600)
    if not data:
        return []

    return [
        {
            "date": f.get("fixture", {}).get("date"),
            "home_team": (f.get("teams", {}).get("home") or {}).get("name", ""),
            "away_team": (f.get("teams", {}).get("away") or {}).get("name", ""),
            "score_home": f.get("goals", {}).get("home"),
            "score_away": f.get("goals", {}).get("away"),
            "league": f.get("league", {}).get("name", ""),
        }
        for f in data.get("response", [])
    ]

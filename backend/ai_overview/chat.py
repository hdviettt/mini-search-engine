"""AI Mode — multi-turn conversational football chat with live data.

Streams responses via SSE. Detects team/league mentions in the
conversation, fetches real data from API-Football, and injects
it as system context for grounded, factual responses.
"""
import json
import time
from typing import Generator

import httpx

import psycopg

from config import GROQ_API_KEY, GROQ_MODEL, AI_OVERVIEW_MAX_TOKENS
from db import get_connection
from sports.detector import detect_sports, TEAM_MAP, LEAGUE_MAP
from sports.api import get_upcoming_fixtures, get_standings, get_live_scores, get_league_fixtures

# Player name → team ID (for fetching team context when players are mentioned)
PLAYER_TEAMS: dict[str, list[int]] = {
    "ronaldo": [2939],  # Al Nassr
    "cristiano ronaldo": [2939],
    "messi": [1600],  # Inter Miami
    "lionel messi": [1600],
    "neymar": [1062],  # Santos (returned 2025)
    "mbappe": [541],  # Real Madrid
    "kylian mbappe": [541],
    "haaland": [50],  # Man City
    "erling haaland": [50],
    "salah": [40],  # Liverpool
    "mohamed salah": [40],
    "vinicius": [541],  # Real Madrid
    "bellingham": [541],  # Real Madrid
    "saka": [42],  # Arsenal
    "bukayo saka": [42],
    "kane": [157],  # Bayern Munich
    "harry kane": [157],
    "de bruyne": [50],  # Man City
    "goat": [2939],  # CR7 = Al Nassr
    "cr7": [2939],
    "the goat": [2939],
}


def _gather_sports_context(messages: list[dict]) -> str:
    """Scan conversation for team/league mentions and fetch relevant live data."""
    # Combine all user messages to find mentions
    all_text = " ".join(m["content"] for m in messages if m["role"] == "user")
    q = all_text.lower()

    context_parts = []

    # Find all teams mentioned (direct team names)
    found_teams = []
    for name, team_id in sorted(TEAM_MAP.items(), key=lambda x: -len(x[0])):
        if name in q and team_id not in [t[1] for t in found_teams]:
            found_teams.append((name, team_id))
        if len(found_teams) >= 3:
            break

    # Also detect player names → add their teams
    for name, team_ids in sorted(PLAYER_TEAMS.items(), key=lambda x: -len(x[0])):
        if name in q:
            for tid in team_ids:
                if tid not in [t[1] for t in found_teams]:
                    found_teams.append((name, tid))
            break

    # Find all leagues mentioned
    found_leagues = []
    for name, league_id in sorted(LEAGUE_MAP.items(), key=lambda x: -len(x[0])):
        if name in q and league_id not in [l[1] for l in found_leagues]:
            found_leagues.append((name, league_id))
        if len(found_leagues) >= 2:
            break

    # Fetch data for each team
    for name, team_id in found_teams:
        fixtures = get_upcoming_fixtures(team_id, next_count=3)
        if fixtures:
            upcoming = []
            for f in fixtures[:3]:
                upcoming.append(f"{f['home_team']} vs {f['away_team']} ({f['date'][:10]}, {f['league']})")
            context_parts.append(f"{name.title()} upcoming: {'; '.join(upcoming)}")

    # Fetch standings for mentioned leagues (or leagues of mentioned teams)
    league_ids_to_fetch = set()
    for _, league_id in found_leagues:
        league_ids_to_fetch.add(league_id)

    # Also get standings for well-known leagues if teams are from them
    known_team_leagues = {
        42: 39, 33: 39, 40: 39, 49: 39, 50: 39, 47: 39, 34: 39,  # PL teams
        529: 140, 541: 140, 530: 140,  # La Liga teams
        489: 135, 505: 135, 496: 135,  # Serie A teams
        157: 78, 165: 78,  # Bundesliga teams
        85: 61,  # Ligue 1
    }
    for _, team_id in found_teams:
        if team_id in known_team_leagues:
            league_ids_to_fetch.add(known_team_leagues[team_id])

    for league_id in list(league_ids_to_fetch)[:2]:
        standings = get_standings(league_id)
        if standings:
            # Find mentioned teams in standings + top 5
            relevant = []
            team_names_lower = {n for n, _ in found_teams}
            for s in standings:
                if s["team"].lower() in team_names_lower or s["rank"] <= 5:
                    relevant.append(f"#{s['rank']} {s['team']} ({s['points']}pts, {s['won']}W-{s['drawn']}D-{s['lost']}L, GD:{s['gd']:+d}, Form:{s['form']})")
            if relevant:
                league_name = next((n for n, lid in LEAGUE_MAP.items() if lid == league_id), f"League {league_id}")
                context_parts.append(f"{league_name.title()} standings: {'; '.join(relevant[:8])}")

    # Check for live scores if conversation mentions "live" or "score"
    if any(kw in q for kw in ["live", "score", "playing", "right now", "today"]):
        live = get_live_scores()
        if live:
            live_text = [f"{m['home_team']} {m['score_home']}-{m['score_away']} {m['away_team']} ({m['elapsed']}', {m['league']})" for m in live[:5]]
            context_parts.append(f"Live matches: {'; '.join(live_text)}")

    return "\n".join(context_parts) if context_parts else ""


def _search_index(query: str) -> str:
    """Search our own index for relevant chunks — grounds the AI in our corpus."""
    try:
        conn = get_connection()
        from rag.embedder import embed_queries
        from rag.retriever import hybrid_retrieve

        embeddings = embed_queries([query])
        chunks, _ = hybrid_retrieve(conn, [query], query_embeddings=embeddings, top_k=3)
        conn.close()

        if not chunks:
            return ""

        parts = []
        for i, chunk in enumerate(chunks[:3], 1):
            title = chunk.get("title", "")[:60]
            content = chunk.get("content", "")[:400]
            parts.append(f"[Source {i}: {title}] {content}")

        return "\n".join(parts)
    except Exception:
        return ""


SYSTEM_PROMPT = """You are an expert football analyst embedded in a search engine. You provide insightful, data-driven analysis about football (soccer).

Rules:
- Use the LIVE DATA provided below when available — cite specific stats, standings, form, and fixtures
- Be conversational but authoritative — like a knowledgeable pundit
- For predictions, reason step by step: form, home/away record, h2h, injuries, motivation
- Keep responses concise (3-5 paragraphs max) unless the user asks for detail
- If you don't have data on something, say so rather than making up stats
- Use bold for key stats and team names"""


def generate_chat_stream(messages: list[dict]) -> Generator[str, None, None]:
    """Stream AI Mode chat responses with live sports data context."""
    if not GROQ_API_KEY:
        yield f"data: {json.dumps({'type': 'error', 'message': 'AI not configured'})}\n\n"
        return

    total_start = time.time()

    # Gather context: sports data + search index
    t0 = time.time()
    latest_query = messages[-1]["content"] if messages else ""
    sports_context = _gather_sports_context(messages)
    index_context = _search_index(latest_query)
    context_ms = round((time.time() - t0) * 1000, 1)

    # Build system message with all context
    system_content = SYSTEM_PROMPT
    if index_context:
        system_content += f"\n\nSEARCH INDEX DATA (from our football corpus):\n{index_context}"
    if sports_context:
        system_content += f"\n\nLIVE DATA (from API-Football, current as of now):\n{sports_context}"

    all_context = ""
    if index_context:
        all_context += f"[Index] {index_context[:200]}..."
    if sports_context:
        all_context += f" [Live] {sports_context[:200]}..."

    # Send metadata
    yield f"data: {json.dumps({'type': 'context', 'sports_data': all_context.strip(), 'time_ms': context_ms})}\n\n"

    # Build messages for LLM
    llm_messages = [{"role": "system", "content": system_content}]
    for m in messages[-10:]:  # Keep last 10 messages for context window
        llm_messages.append({"role": m["role"], "content": m["content"]})

    # Stream response
    try:
        with httpx.stream(
            "POST",
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json={
                "model": GROQ_MODEL,
                "messages": llm_messages,
                "max_tokens": 800,
                "temperature": 0.4,
                "stream": True,
            },
            timeout=20,
        ) as response:
            full_text = ""
            for line in response.iter_lines():
                if line.startswith("data: ") and line != "data: [DONE]":
                    try:
                        chunk = json.loads(line[6:])
                        delta = chunk["choices"][0].get("delta", {}).get("content", "")
                        if delta:
                            full_text += delta
                            yield f"data: {json.dumps({'type': 'token', 'content': delta})}\n\n"
                    except (json.JSONDecodeError, KeyError, IndexError):
                        pass

            total_ms = round((time.time() - total_start) * 1000, 1)
            yield f"data: {json.dumps({'type': 'done', 'total_ms': total_ms, 'has_sports_data': bool(sports_context)})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

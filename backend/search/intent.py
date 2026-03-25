"""Query intent detection — classifies queries to route to the right UI.

Rule-based first (~0ms), LLM fallback for ambiguous queries (~200ms).
"""
import re
import time

import httpx
import psycopg

from config import GROQ_API_KEY, GROQ_MODEL

# Entity name cache (loaded from DB, refreshed periodically)
_entity_cache: set[str] | None = None
_entity_cache_time: float = 0
_CACHE_TTL = 300  # 5 minutes


def _load_entity_names(conn: psycopg.Connection) -> set[str]:
    """Load all entity names (lowercased) from the database."""
    global _entity_cache, _entity_cache_time

    if _entity_cache and (time.time() - _entity_cache_time) < _CACHE_TTL:
        return _entity_cache

    try:
        rows = conn.execute(
            "SELECT LOWER(name) FROM entities UNION SELECT LOWER(alias) FROM entity_aliases"
        ).fetchall()
        _entity_cache = {r[0] for r in rows}
    except Exception:
        _entity_cache = set()

    _entity_cache_time = time.time()
    return _entity_cache


def _find_query_entities(query: str, entity_names: set[str]) -> list[str]:
    """Find which known entities appear in the query."""
    q_lower = query.lower().strip()

    # Exact match first (most common for entity lookups)
    if q_lower in entity_names:
        return [query.strip()]

    # Substring match for multi-word queries
    found = []
    for name in entity_names:
        if len(name) > 2 and name in q_lower:
            found.append(name)

    # Return longest matches first (prefer "Cristiano Ronaldo" over "Ronaldo")
    found.sort(key=len, reverse=True)
    return found[:3]


def _detect_rules(query: str, entity_names: set[str]) -> dict | None:
    """Rule-based intent detection. Returns None if ambiguous."""
    q = query.lower().strip()
    entities = _find_query_entities(query, entity_names)

    # Comparison: contains "vs" or "versus"
    if re.search(r'\bvs\.?\b|\bversus\b|\bcompared?\s+to\b', q):
        return {"intent": "comparison", "entities": entities, "confidence": 0.9, "method": "rules"}

    # Factoid: starts with question word
    if re.match(r'^(who|what|when|where|how many|how much|which|why|how old|how tall)\b', q):
        return {"intent": "factoid", "entities": entities, "confidence": 0.85, "method": "rules"}

    # Navigational: contains a domain/site name
    nav_keywords = ["bbc", "espn", "transfermarkt", "wikipedia", "sky sports", "goal.com", ".com", ".org", "site"]
    if any(kw in q for kw in nav_keywords):
        return {"intent": "navigational", "entities": entities, "confidence": 0.8, "method": "rules"}

    # Entity lookup: query closely matches a known entity name
    if entities and len(q.split()) <= 4:
        # Short query that matches an entity → likely entity lookup
        return {"intent": "entity_lookup", "entities": entities, "confidence": 0.85, "method": "rules"}

    return None  # ambiguous → use LLM


def _detect_llm(query: str, entities: list[str]) -> dict:
    """LLM-based intent detection for ambiguous queries."""
    if not GROQ_API_KEY:
        return {"intent": "informational", "entities": entities, "confidence": 0.5, "method": "fallback"}

    try:
        response = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json={
                "model": GROQ_MODEL,
                "messages": [{"role": "user", "content": f'Classify this search query into exactly one category: entity_lookup, factoid, navigational, informational, comparison.\nQuery: "{query}"\nCategory:'}],
                "max_tokens": 10,
                "temperature": 0,
            },
            timeout=5,
        )
        response.raise_for_status()
        intent = response.json()["choices"][0]["message"]["content"].strip().lower()

        valid = {"entity_lookup", "factoid", "navigational", "informational", "comparison"}
        if intent not in valid:
            intent = "informational"

        return {"intent": intent, "entities": entities, "confidence": 0.7, "method": "llm"}
    except Exception:
        return {"intent": "informational", "entities": entities, "confidence": 0.5, "method": "fallback"}


def detect_intent(conn: psycopg.Connection, query: str) -> dict:
    """Detect the intent of a search query.

    Returns: {"intent": str, "entities": list[str], "confidence": float, "method": str}
    """
    entity_names = _load_entity_names(conn)

    # Try rules first
    result = _detect_rules(query, entity_names)
    if result:
        return result

    # LLM fallback
    entities = _find_query_entities(query, entity_names)
    return _detect_llm(query, entities)

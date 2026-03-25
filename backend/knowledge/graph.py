"""Knowledge Graph builder — extracts relationships between entities using Groq LLM.

Only processes pages that have 2+ entities detected by NER.
Extracts relationships like PLAYS_FOR, MANAGES, WON, NATIONALITY, etc.
"""
import json
import time

import httpx
import psycopg

from config import GROQ_API_KEY, GROQ_MODEL

RELATION_TYPES = [
    "PLAYS_FOR",       # player → team
    "PLAYED_FOR",      # player → team (past)
    "MANAGES",         # coach → team
    "COMPETES_IN",     # team → league/tournament
    "NATIONALITY",     # player/coach → country
    "WON",             # player/team → tournament
    "LOCATED_IN",      # team/stadium → country
]

COMBINED_PROMPT = """From this football text, extract relationships AND attributes. Return JSON with two arrays.

Text:
{text}

Return exactly this format:
{{"relationships": [{{"source": "name", "relation": "PLAYS_FOR|PLAYED_FOR|MANAGES|COMPETES_IN|NATIONALITY|WON", "target": "name", "detail": "year or role"}}], "attributes": [{{"entity": "name", "key": "nationality|position|birth_date|founded_year|stadium|nickname", "value": "value"}}]}}

Use short canonical names. Only include facts clearly stated in the text.
JSON:"""


def _call_groq_combined(prompt: str) -> dict:
    """Call Groq API and parse JSON object response with relationships + attributes."""
    if not GROQ_API_KEY:
        return {"relationships": [], "attributes": []}

    try:
        response = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json={
                "model": GROQ_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 800,
                "temperature": 0.1,
            },
            timeout=15,
        )
        response.raise_for_status()
        text = response.json()["choices"][0]["message"]["content"].strip()

        # Extract JSON object from response
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            parsed = json.loads(text[start:end])
            return {
                "relationships": parsed.get("relationships", []),
                "attributes": parsed.get("attributes", []),
            }
    except Exception as e:
        print(f"  Groq KG error: {e}")

    return {"relationships": [], "attributes": []}


def _fuzzy_match_entity(conn: psycopg.Connection, name: str, _cache: dict = {}) -> int | None:
    """Find entity ID by exact or fuzzy name match. Cached per session."""
    if name in _cache:
        return _cache[name]

    # Exact match
    row = conn.execute("SELECT id FROM entities WHERE LOWER(name) = LOWER(%s) LIMIT 1", (name,)).fetchone()
    if row:
        _cache[name] = row[0]
        return row[0]

    # Partial match — entity name contains the query or vice versa
    row = conn.execute(
        "SELECT id FROM entities WHERE LOWER(name) LIKE %s OR LOWER(%s) LIKE '%%' || LOWER(name) || '%%' LIMIT 1",
        (f"%{name.lower()}%", name),
    ).fetchone()
    if row:
        _cache[name] = row[0]
        return row[0]

    _cache[name] = None
    return None


def extract_relationships(conn: psycopg.Connection, page_id: int, title: str, body_text: str, entity_names: list[str]) -> int:
    """Extract and store relationships for a single page."""
    text = f"{title}\n{(body_text or '')[:3000]}"

    prompt = EXTRACTION_PROMPT.format(text=text)
    rels = _call_groq(prompt)
    stored = 0

    for rel in rels:
        source_name = rel.get("source", "").strip()
        target_name = rel.get("target", "").strip()
        relation = rel.get("relation", "").upper().replace(" ", "_")
        detail = rel.get("detail", "")

        if not source_name or not target_name or source_name == target_name:
            continue
        if relation not in RELATION_TYPES:
            continue

        source_id = _fuzzy_match_entity(conn, source_name)
        target_id = _fuzzy_match_entity(conn, target_name)
        if not source_id or not target_id:
            continue

        attrs = {"detail": detail} if detail else {}
        try:
            conn.execute(
                """INSERT INTO entity_relationships (source_entity, relation_type, target_entity, attributes, source_page, confidence)
                   VALUES (%s, %s, %s, %s, %s, 1.0)
                   ON CONFLICT (source_entity, relation_type, target_entity)
                   DO UPDATE SET confidence = entity_relationships.confidence + 0.5,
                                 attributes = entity_relationships.attributes || %s""",
                (source_id, relation, target_id, json.dumps(attrs), page_id, json.dumps(attrs)),
            )
            stored += 1
        except Exception:
            conn.rollback()
            continue

    conn.commit()
    return stored


def extract_attributes(conn: psycopg.Connection, page_id: int, title: str, body_text: str, entity_names: list[str]) -> int:
    """Extract and store entity attributes for a single page."""
    text = f"{title}\n{(body_text or '')[:3000]}"

    prompt = ATTRIBUTE_PROMPT.format(text=text)
    attrs = _call_groq(prompt)
    stored = 0

    for attr in attrs:
        entity_name = attr.get("entity", "").strip()
        key = attr.get("key", "")
        value = attr.get("value", "")

        if not entity_name or not key or not value:
            continue

        entity_id = _fuzzy_match_entity(conn, entity_name)
        if not entity_id:
            continue

        try:
            conn.execute(
                """INSERT INTO entity_attributes (entity_id, attr_key, attr_value, source_page, confidence)
                   VALUES (%s, %s, %s, %s, 1.0)
                   ON CONFLICT (entity_id, attr_key, attr_value)
                   DO UPDATE SET confidence = entity_attributes.confidence + 0.5""",
                (entity_id, key, str(value), page_id),
            )
            stored += 1
        except Exception:
            conn.rollback()
            continue

    conn.commit()
    return stored


def build_knowledge_graph(conn: psycopg.Connection, progress_callback=None):
    """Build knowledge graph from pages with 2+ entities.

    Calls Groq LLM to extract relationships and attributes.
    Rate-limited to avoid hitting API limits.
    """
    print("Building knowledge graph...")

    # Clear old KG data for a fresh build
    try:
        conn.execute("DELETE FROM entity_relationships")
        conn.execute("DELETE FROM entity_attributes")
        conn.commit()
        print("  Cleared old relationships and attributes.")
    except Exception:
        conn.rollback()

    # Ensure KG tables exist
    conn.execute("""
        CREATE TABLE IF NOT EXISTS entity_attributes (
            id SERIAL PRIMARY KEY, entity_id INTEGER NOT NULL REFERENCES entities(id),
            attr_key TEXT NOT NULL, attr_value TEXT NOT NULL,
            source_page INTEGER REFERENCES pages(id), confidence REAL DEFAULT 1.0,
            UNIQUE(entity_id, attr_key, attr_value)
        )""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS entity_relationships (
            id SERIAL PRIMARY KEY,
            source_entity INTEGER NOT NULL REFERENCES entities(id),
            relation_type TEXT NOT NULL,
            target_entity INTEGER NOT NULL REFERENCES entities(id),
            attributes JSONB DEFAULT '{}',
            source_page INTEGER REFERENCES pages(id), confidence REAL DEFAULT 1.0,
            UNIQUE(source_entity, relation_type, target_entity)
        )""")
    conn.commit()

    # Find pages with 3+ entities (pages with only 2 rarely yield good relationships)
    pages = conn.execute(
        """SELECT pe.page_id, p.title, p.body_text, COUNT(*) as entity_count,
                  ARRAY_AGG(e.name) as entity_names
           FROM page_entities pe
           JOIN pages p ON pe.page_id = p.id
           JOIN entities e ON pe.entity_id = e.id
           GROUP BY pe.page_id, p.title, p.body_text
           HAVING COUNT(*) >= 3
           ORDER BY COUNT(*) DESC
           LIMIT 300"""
    ).fetchall()

    print(f"  {len(pages)} pages with 3+ entities to process...")
    total_rels = 0
    total_attrs = 0

    for i, (page_id, title, body_text, entity_count, entity_names) in enumerate(pages):
        # Single combined API call for relationships + attributes
        text = f"{title}\n{(body_text or '')[:3000]}"
        prompt = COMBINED_PROMPT.format(text=text)
        result = _call_groq_combined(prompt)

        # Store relationships
        for rel in result.get("relationships", []):
            source_name = rel.get("source", "").strip()
            target_name = rel.get("target", "").strip()
            relation = rel.get("relation", "").upper().replace(" ", "_")
            detail = rel.get("detail", "")

            if not source_name or not target_name or source_name == target_name:
                continue
            if relation not in RELATION_TYPES:
                continue

            source_id = _fuzzy_match_entity(conn, source_name)
            target_id = _fuzzy_match_entity(conn, target_name)
            if not source_id or not target_id:
                continue

            attrs = {"detail": detail} if detail else {}
            try:
                conn.execute(
                    """INSERT INTO entity_relationships (source_entity, relation_type, target_entity, attributes, source_page, confidence)
                       VALUES (%s, %s, %s, %s, %s, 1.0)
                       ON CONFLICT (source_entity, relation_type, target_entity)
                       DO UPDATE SET confidence = entity_relationships.confidence + 0.5,
                                     attributes = entity_relationships.attributes || %s""",
                    (source_id, relation, target_id, json.dumps(attrs), page_id, json.dumps(attrs)),
                )
                total_rels += 1
            except Exception:
                conn.rollback()

        # Store attributes
        for attr in result.get("attributes", []):
            entity_name = attr.get("entity", "").strip()
            key = attr.get("key", "")
            value = attr.get("value", "")
            if not entity_name or not key or not value:
                continue

            entity_id = _fuzzy_match_entity(conn, entity_name)
            if not entity_id:
                continue

            try:
                conn.execute(
                    """INSERT INTO entity_attributes (entity_id, attr_key, attr_value, source_page, confidence)
                       VALUES (%s, %s, %s, %s, 1.0)
                       ON CONFLICT (entity_id, attr_key, attr_value)
                       DO UPDATE SET confidence = entity_attributes.confidence + 0.5""",
                    (entity_id, key, str(value), page_id),
                )
                total_attrs += 1
            except Exception:
                conn.rollback()

        conn.commit()

        if (i + 1) % 10 == 0:
            print(f"  Processed {i + 1}/{len(pages)} pages ({total_rels} relationships, {total_attrs} attributes)...")

        if progress_callback and (i + 1) % 5 == 0:
            progress_callback({
                "pages_done": i + 1,
                "pages_total": len(pages),
                "relationships": total_rels,
                "attributes": total_attrs,
            })

        # Rate limit: 3s between pages (1 API call per page, stay under Groq 30 RPM)
        time.sleep(3)

    # Summary
    rel_count = conn.execute("SELECT COUNT(*) FROM entity_relationships").fetchone()[0]
    attr_count = conn.execute("SELECT COUNT(*) FROM entity_attributes").fetchone()[0]
    print(f"  {rel_count} total relationships, {attr_count} total attributes.")
    print("Knowledge graph built.")

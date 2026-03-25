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

EXTRACTION_PROMPT = """Extract football entity relationships from this text.

Entities found on this page:
{entities}

Text:
{text}

Return ONLY a JSON array of relationships. Each relationship has:
- "source": exact entity name from the list above
- "relation": one of {relations}
- "target": exact entity name from the list above
- "detail": optional short detail (e.g. year, role)

Rules:
- ONLY use entity names from the list above
- ONLY use relation types from the list above
- Skip uncertain relationships
- Return [] if no clear relationships found

JSON array:"""

ATTRIBUTE_PROMPT = """Extract key attributes for these football entities from the text.

Entities:
{entities}

Text:
{text}

Return ONLY a JSON array of attributes. Each attribute has:
- "entity": exact entity name from the list above
- "key": one of: nationality, position, birth_date, founded_year, stadium, capacity, nickname
- "value": the attribute value

Rules:
- ONLY use entity names from the list above
- Skip uncertain attributes
- Return [] if no clear attributes found

JSON array:"""


def _call_groq(prompt: str) -> list[dict]:
    """Call Groq API and parse JSON array response."""
    if not GROQ_API_KEY:
        return []

    try:
        response = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json={
                "model": GROQ_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 500,
                "temperature": 0.1,
            },
            timeout=10,
        )
        response.raise_for_status()
        text = response.json()["choices"][0]["message"]["content"].strip()

        # Extract JSON array from response
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
    except Exception as e:
        print(f"  Groq KG error: {e}")

    return []


def extract_relationships(conn: psycopg.Connection, page_id: int, title: str, body_text: str, entity_names: list[str]) -> int:
    """Extract and store relationships for a single page."""
    text = f"{title}\n{(body_text or '')[:3000]}"
    entities_str = ", ".join(entity_names)

    prompt = EXTRACTION_PROMPT.format(
        entities=entities_str,
        text=text,
        relations=", ".join(RELATION_TYPES),
    )

    rels = _call_groq(prompt)
    stored = 0

    # Build name → entity_id lookup
    name_to_id = {}
    for name in entity_names:
        row = conn.execute(
            "SELECT id FROM entities WHERE name = %s LIMIT 1", (name,)
        ).fetchone()
        if row:
            name_to_id[name] = row[0]

    for rel in rels:
        source_name = rel.get("source", "")
        target_name = rel.get("target", "")
        relation = rel.get("relation", "")
        detail = rel.get("detail", "")

        if source_name not in name_to_id or target_name not in name_to_id:
            continue
        if relation not in RELATION_TYPES:
            continue
        if source_name == target_name:
            continue

        attrs = {"detail": detail} if detail else {}

        try:
            conn.execute(
                """INSERT INTO entity_relationships (source_entity, relation_type, target_entity, attributes, source_page, confidence)
                   VALUES (%s, %s, %s, %s, %s, 1.0)
                   ON CONFLICT (source_entity, relation_type, target_entity)
                   DO UPDATE SET confidence = entity_relationships.confidence + 0.5,
                                 attributes = entity_relationships.attributes || %s""",
                (name_to_id[source_name], relation, name_to_id[target_name],
                 json.dumps(attrs), page_id, json.dumps(attrs)),
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
    entities_str = ", ".join(entity_names)

    prompt = ATTRIBUTE_PROMPT.format(entities=entities_str, text=text)
    attrs = _call_groq(prompt)
    stored = 0

    name_to_id = {}
    for name in entity_names:
        row = conn.execute("SELECT id FROM entities WHERE name = %s LIMIT 1", (name,)).fetchone()
        if row:
            name_to_id[name] = row[0]

    for attr in attrs:
        entity_name = attr.get("entity", "")
        key = attr.get("key", "")
        value = attr.get("value", "")

        if entity_name not in name_to_id or not key or not value:
            continue

        try:
            conn.execute(
                """INSERT INTO entity_attributes (entity_id, attr_key, attr_value, source_page, confidence)
                   VALUES (%s, %s, %s, %s, 1.0)
                   ON CONFLICT (entity_id, attr_key, attr_value)
                   DO UPDATE SET confidence = entity_attributes.confidence + 0.5""",
                (name_to_id[entity_name], key, str(value), page_id),
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

    print(f"  {len(pages)} pages with 2+ entities to process...")
    total_rels = 0
    total_attrs = 0

    for i, (page_id, title, body_text, entity_count, entity_names) in enumerate(pages):
        # Extract relationships
        rels = extract_relationships(conn, page_id, title, body_text, entity_names)
        total_rels += rels

        # Extract attributes
        attrs = extract_attributes(conn, page_id, title, body_text, entity_names)
        total_attrs += attrs

        if (i + 1) % 10 == 0:
            print(f"  Processed {i + 1}/{len(pages)} pages ({total_rels} relationships, {total_attrs} attributes)...")

        if progress_callback and (i + 1) % 5 == 0:
            progress_callback({
                "pages_done": i + 1,
                "pages_total": len(pages),
                "relationships": total_rels,
                "attributes": total_attrs,
            })

        # Rate limit: ~2s between pages (2 API calls per page)
        time.sleep(2)

    # Summary
    rel_count = conn.execute("SELECT COUNT(*) FROM entity_relationships").fetchone()[0]
    attr_count = conn.execute("SELECT COUNT(*) FROM entity_attributes").fetchone()[0]
    print(f"  {rel_count} total relationships, {attr_count} total attributes.")
    print("Knowledge graph built.")

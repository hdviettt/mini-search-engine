"""Named Entity Recognition using spaCy.

Extracts entities from crawled pages and stores them in the database.
Runs at index time (offline), not query time.

spaCy entity types → football domain types:
    PERSON  → player, coach (default: player)
    ORG     → team, league, federation
    GPE     → country
    EVENT   → tournament
    FAC     → stadium
"""
import psycopg

# Lazy-load spaCy model
_nlp = None


def _get_nlp():
    global _nlp
    if _nlp is None:
        import spacy
        _nlp = spacy.load("en_core_web_sm")
    return _nlp


# Known football entity type hints (lowercased keywords)
_LEAGUE_KEYWORDS = {"league", "liga", "serie", "bundesliga", "ligue", "championship", "division", "premiership", "mls"}
_TOURNAMENT_KEYWORDS = {"cup", "world cup", "euro", "copa", "champions league", "europa league", "tournament", "olympics"}
_FEDERATION_KEYWORDS = {"fifa", "uefa", "conmebol", "caf", "afc", "concacaf", "ofc"}
_COACH_KEYWORDS = {"manager", "coach", "head coach", "managed", "manages"}


def _classify_org(name: str, context: str) -> str:
    """Classify an ORG entity as team, league, or federation."""
    lower = name.lower()
    ctx = context.lower()

    for kw in _FEDERATION_KEYWORDS:
        if kw in lower:
            return "federation"
    for kw in _LEAGUE_KEYWORDS:
        if kw in lower:
            return "league"
    for kw in _TOURNAMENT_KEYWORDS:
        if kw in lower:
            return "tournament"

    # Default ORG → team (most common in football corpus)
    return "team"


def _classify_person(name: str, context: str) -> str:
    """Classify a PERSON entity as player or coach."""
    # Check surrounding context for coach indicators
    name_pos = context.lower().find(name.lower())
    if name_pos >= 0:
        window = context[max(0, name_pos - 100):name_pos + len(name) + 100].lower()
        for kw in _COACH_KEYWORDS:
            if kw in window:
                return "coach"
    return "player"


def extract_entities(title: str, body_text: str) -> list[dict]:
    """Extract football entities from a page's title and body.

    Returns list of {"name": str, "type": str, "in_title": bool, "count": int}
    """
    nlp = _get_nlp()

    # Process title and body separately
    title_doc = nlp(title or "")
    body_doc = nlp((body_text or "")[:10000])  # limit to first 10K chars for speed

    # Collect entities with counts
    entity_counts: dict[tuple[str, str], dict] = {}  # (name, type) → info

    full_text = (title or "") + " " + (body_text or "")

    for doc, is_title in [(title_doc, True), (body_doc, False)]:
        for ent in doc.ents:
            name = ent.text.strip()
            if len(name) < 2 or len(name) > 100:
                continue

            # Map spaCy label to football type
            if ent.label_ == "PERSON":
                etype = _classify_person(name, full_text[:5000])
            elif ent.label_ == "ORG":
                etype = _classify_org(name, full_text[:5000])
            elif ent.label_ == "GPE":
                etype = "country"
            elif ent.label_ == "EVENT":
                etype = "tournament"
            elif ent.label_ == "FAC":
                etype = "stadium"
            else:
                continue  # skip DATE, MONEY, CARDINAL, etc.

            key = (name, etype)
            if key not in entity_counts:
                entity_counts[key] = {"name": name, "type": etype, "in_title": False, "count": 0}

            entity_counts[key]["count"] += 1
            if is_title:
                entity_counts[key]["in_title"] = True

    return list(entity_counts.values())


def extract_and_store(conn: psycopg.Connection, page_id: int, title: str, body_text: str):
    """Extract entities from a page and store in the database."""
    entities = extract_entities(title, body_text)

    for ent in entities:
        # Upsert entity
        row = conn.execute(
            """INSERT INTO entities (name, entity_type, canonical)
               VALUES (%s, %s, %s)
               ON CONFLICT (name, entity_type) DO UPDATE SET canonical = entities.canonical
               RETURNING id""",
            (ent["name"], ent["type"], ent["name"].lower()),
        ).fetchone()
        entity_id = row[0]

        # Upsert page_entity link
        conn.execute(
            """INSERT INTO page_entities (page_id, entity_id, frequency, in_title)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (page_id, entity_id) DO UPDATE
               SET frequency = %s, in_title = %s""",
            (page_id, entity_id, ent["count"], ent["in_title"], ent["count"], ent["in_title"]),
        )

    conn.commit()
    return len(entities)


def extract_all_entities(conn: psycopg.Connection, progress_callback=None):
    """Run NER over all crawled pages. Skips pages already processed."""
    print("Extracting entities from crawled pages...")

    # Get pages that don't have entities yet
    pages = conn.execute(
        """SELECT p.id, p.title, p.body_text FROM pages p
           WHERE p.id NOT IN (SELECT DISTINCT page_id FROM page_entities)
           ORDER BY p.id"""
    ).fetchall()

    print(f"  {len(pages)} pages to process...")
    total_entities = 0

    for i, (page_id, title, body_text) in enumerate(pages):
        count = extract_and_store(conn, page_id, title, body_text)
        total_entities += count

        if (i + 1) % 50 == 0:
            print(f"  Processed {i + 1}/{len(pages)} pages ({total_entities} entities so far)...")

        if progress_callback and (i + 1) % 10 == 0:
            progress_callback({
                "pages_done": i + 1,
                "pages_total": len(pages),
                "entities_found": total_entities,
                "current_title": (title or "")[:60],
            })

    # Summary
    entity_count = conn.execute("SELECT COUNT(*) FROM entities").fetchone()[0]
    link_count = conn.execute("SELECT COUNT(*) FROM page_entities").fetchone()[0]
    print(f"  {entity_count} unique entities, {link_count} page-entity links.")
    print("Entity extraction complete.")

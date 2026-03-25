"""Named Entity Recognition using spaCy.

Extracts entities from crawled pages and stores them in the database.
Runs at index time (offline), not query time.

spaCy entity types → football domain types:
    PERSON  → player, coach (default: player)
    ORG     → team, league, federation
    GPE     → country
    EVENT   → tournament
    FAC     → stadium

Quality controls:
    - Blocklist filters obvious noise (Wikipedia, JSTOR, BBC, etc.)
    - Minimum name length (3 chars) and maximum (60 chars)
    - Entities must appear on 2+ pages to be kept (post-processing)
    - Entities on >40% of corpus are too generic and removed
"""
import psycopg

# Lazy-load spaCy model
_nlp = None


def _get_nlp():
    global _nlp
    if _nlp is None:
        import spacy
        try:
            _nlp = spacy.load("en_core_web_md")
        except OSError:
            _nlp = spacy.load("en_core_web_sm")
    return _nlp


# ── Noise filtering ──────────────────────────────────────────

# Entities that are NEVER football entities — site names, generic terms, artifacts
ENTITY_BLOCKLIST = frozenset({
    # Websites / publishers
    "wikipedia", "bbc", "espn", "bbc sport", "sky sports", "the guardian",
    "goal.com", "transfermarkt", "fourfourtwo", "givemesport",
    "reuters", "associated press", "ap", "afp",
    # Academic / reference
    "jstor", "isbn", "doi", "pmid", "issn", "oclc", "archived",
    "oxford university press", "cambridge university press",
    # Generic terms spaCy misclassifies
    "learn", "read", "edit", "view", "search", "click", "download",
    "subscribe", "sign up", "log in", "cookie", "privacy",
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    # Common false positives
    "fc", "cf", "sc", "ac", "ss", "as", "us",
    "the", "unknown", "n/a", "tba", "tbd",
})

# Strings that indicate the entity is junk (partial matches)
BLOCKLIST_PATTERNS = [
    " - wikipedia", " – wikipedia", "(disambiguation)", "[edit]",
    "citation needed", "unreliable source", "http://", "https://",
    ".com", ".org", ".net", ".co.uk",
]


def _is_blocked(name: str) -> bool:
    """Check if entity name should be filtered out."""
    lower = name.lower().strip()

    if lower in ENTITY_BLOCKLIST:
        return True

    for pattern in BLOCKLIST_PATTERNS:
        if pattern in lower:
            return True

    # Too short or too long
    if len(lower) < 3 or len(lower) > 60:
        return True

    # Too many words — real entities are 1-3 words, concatenated lists are 4+
    if len(lower.split()) > 4:
        return True

    # All digits or mostly non-alpha
    alpha_count = sum(1 for c in lower if c.isalpha())
    if alpha_count < len(lower) * 0.5:
        return True

    # Contains sport/game names (Wikipedia sidebar contamination)
    sport_words = {"korfball", "lumberjack", "badminton", "baseball", "basketball",
                   "cricket", "curling", "cycling", "darts", "equestrian", "fencing",
                   "gymnastics", "handball", "hockey", "judo", "karate", "lacrosse",
                   "motorsport", "orienteering", "paralympic", "polo", "rowing",
                   "rugby", "sailing", "shooting", "skating", "skiing", "snooker",
                   "squash", "surfing", "swimming", "taekwondo", "tennis", "triathlon",
                   "volleyball", "weightlifting", "wrestling", "archery", "boxing",
                   "canoeing", "diving", "golf", "pentathlon", "softball", "cuju",
                   "harpastum", "shinty", "sepak", "gateball", "cammag", "bando",
                   "austus", "ritinis", "marn", "grook", "lelo"}
    words = set(lower.split())
    if words & sport_words:
        return True

    return False


# ── Entity classification ────────────────────────────────────

_LEAGUE_KEYWORDS = {"league", "liga", "serie", "bundesliga", "ligue", "championship", "division", "premiership", "mls", "eredivisie"}
_TOURNAMENT_KEYWORDS = {"cup", "world cup", "euro", "copa", "champions league", "europa league", "tournament", "olympics", "ballon"}
_FEDERATION_KEYWORDS = {"fifa", "uefa", "conmebol", "caf", "afc", "concacaf", "ofc"}
_COACH_KEYWORDS = {"manager", "coach", "head coach", "managed", "manages", "appointed"}


def _classify_org(name: str, context: str) -> str:
    lower = name.lower()
    for kw in _FEDERATION_KEYWORDS:
        if kw in lower:
            return "federation"
    for kw in _LEAGUE_KEYWORDS:
        if kw in lower:
            return "league"
    for kw in _TOURNAMENT_KEYWORDS:
        if kw in lower:
            return "tournament"
    return "team"


def _classify_person(name: str, context: str) -> str:
    name_pos = context.lower().find(name.lower())
    if name_pos >= 0:
        window = context[max(0, name_pos - 100):name_pos + len(name) + 100].lower()
        for kw in _COACH_KEYWORDS:
            if kw in window:
                return "coach"
    return "player"


# ── Extraction ───────────────────────────────────────────────

def _clean_body_for_ner(text: str) -> str:
    """Strip common Wikipedia/web noise from body text before NER."""
    import re

    # Remove citation markers: [1], [2], [edit], [citation needed]
    text = re.sub(r"\[\d+\]", "", text)
    text = re.sub(r"\[edit\]", "", text)
    text = re.sub(r"\[citation needed\]", "", text)
    text = re.sub(r"\[unreliable source[^\]]*\]", "", text)

    # Cut at "References" or "See also" sections
    for marker in ["References ", "External links ", "See also ", "Further reading ",
                    "Notes and references ", "Bibliography "]:
        idx = text.find(marker)
        if idx > 500:
            text = text[:idx]
            break

    # Remove ISBN, ISSN, DOI patterns
    text = re.sub(r"ISBN\s+[\d\-X]+", "", text)
    text = re.sub(r"ISSN\s+[\d\-]+", "", text)
    text = re.sub(r"doi:\S+", "", text)

    # Remove URLs
    text = re.sub(r"https?://\S+", "", text)

    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()

    return text


def extract_entities(title: str, body_text: str) -> list[dict]:
    """Extract football entities from a page's title and body."""
    nlp = _get_nlp()

    clean_body = _clean_body_for_ner(body_text or "")
    title_doc = nlp(title or "")
    body_doc = nlp(clean_body[:10000])

    entity_counts: dict[tuple[str, str], dict] = {}
    full_text = (title or "") + " " + (body_text or "")

    for doc, is_title in [(title_doc, True), (body_doc, False)]:
        for ent in doc.ents:
            name = ent.text.strip()

            if _is_blocked(name):
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
                continue

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
        row = conn.execute(
            """INSERT INTO entities (name, entity_type, canonical)
               VALUES (%s, %s, %s)
               ON CONFLICT (name, entity_type) DO UPDATE SET canonical = entities.canonical
               RETURNING id""",
            (ent["name"], ent["type"], ent["name"].lower()),
        ).fetchone()
        entity_id = row[0]

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
    """Run NER over all crawled pages. Clears previous results for a fresh run."""
    print("Extracting entities from crawled pages...")

    # Ensure tables exist
    conn.execute("""
        CREATE TABLE IF NOT EXISTS entities (
            id SERIAL PRIMARY KEY, name TEXT NOT NULL, entity_type TEXT NOT NULL,
            canonical TEXT, description TEXT, created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(name, entity_type)
        )""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS page_entities (
            page_id INTEGER NOT NULL REFERENCES pages(id),
            entity_id INTEGER NOT NULL REFERENCES entities(id),
            frequency INTEGER DEFAULT 1, in_title BOOLEAN DEFAULT false,
            PRIMARY KEY (page_id, entity_id)
        )""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS entity_aliases (
            id SERIAL PRIMARY KEY, entity_id INTEGER NOT NULL REFERENCES entities(id),
            alias TEXT NOT NULL, UNIQUE(entity_id, alias)
        )""")
    conn.commit()

    # Clear old data for a fresh extraction (order matters: FK dependencies)
    try:
        conn.execute("DELETE FROM entity_relationships")
        conn.execute("DELETE FROM entity_attributes")
    except Exception:
        conn.rollback()
    conn.execute("DELETE FROM page_entities")
    conn.execute("DELETE FROM entity_aliases")
    conn.execute("DELETE FROM entities")
    conn.commit()
    print("  Cleared old entity data.")

    pages = conn.execute("SELECT id, title, body_text FROM pages ORDER BY id").fetchall()
    print(f"  {len(pages)} pages to process...")
    total_entities = 0

    for i, (page_id, title, body_text) in enumerate(pages):
        count = extract_and_store(conn, page_id, title, body_text)
        total_entities += count

        if (i + 1) % 100 == 0:
            print(f"  Processed {i + 1}/{len(pages)} pages ({total_entities} entities so far)...")

        if progress_callback and (i + 1) % 10 == 0:
            progress_callback({
                "pages_done": i + 1,
                "pages_total": len(pages),
                "entities_found": total_entities,
                "current_title": (title or "")[:60],
            })

    # Post-processing: remove entities that appear on only 1 page (likely noise)
    removed = conn.execute("""
        DELETE FROM entities WHERE id IN (
            SELECT e.id FROM entities e
            LEFT JOIN page_entities pe ON e.id = pe.entity_id
            GROUP BY e.id
            HAVING COUNT(pe.page_id) < 2
        ) RETURNING id
    """).fetchall()
    conn.commit()
    print(f"  Removed {len(removed)} single-page entities (noise).")

    # Remove entities on >15% of pages (too generic — likely boilerplate)
    total_pages = len(pages)
    threshold = int(total_pages * 0.15)
    if threshold > 10:
        removed2 = conn.execute("""
            DELETE FROM entities WHERE id IN (
                SELECT e.id FROM entities e
                JOIN page_entities pe ON e.id = pe.entity_id
                GROUP BY e.id
                HAVING COUNT(pe.page_id) > %s
            ) RETURNING id
        """, (threshold,)).fetchall()
        conn.commit()
        print(f"  Removed {len(removed2)} over-common entities (>40% of corpus).")

    entity_count = conn.execute("SELECT COUNT(*) FROM entities").fetchone()[0]
    link_count = conn.execute("SELECT COUNT(*) FROM page_entities").fetchone()[0]
    print(f"  {entity_count} unique entities, {link_count} page-entity links.")
    print("Entity extraction complete.")

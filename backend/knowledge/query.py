"""Knowledge Graph queries — entity card lookups for OneBox and API."""
import psycopg


def get_entity_card(conn: psycopg.Connection, entity_name: str) -> dict | None:
    """Look up an entity by name (or alias) and return structured card data.

    Returns None if entity not found or has insufficient data.
    """
    # Find entity by exact name or alias
    row = conn.execute(
        "SELECT id, name, entity_type, canonical, description FROM entities WHERE LOWER(name) = LOWER(%s)",
        (entity_name,),
    ).fetchone()

    if not row:
        # Try aliases
        alias_row = conn.execute(
            "SELECT entity_id FROM entity_aliases WHERE LOWER(alias) = LOWER(%s)",
            (entity_name,),
        ).fetchone()
        if alias_row:
            row = conn.execute(
                "SELECT id, name, entity_type, canonical, description FROM entities WHERE id = %s",
                (alias_row[0],),
            ).fetchone()

    if not row:
        return None

    entity_id, name, entity_type, canonical, description = row

    # Get attributes
    attr_rows = conn.execute(
        """SELECT attr_key, attr_value, confidence
           FROM entity_attributes WHERE entity_id = %s
           ORDER BY confidence DESC""",
        (entity_id,),
    ).fetchall()

    attributes = {}
    for key, value, conf in attr_rows:
        if key not in attributes:  # keep highest-confidence value per key
            attributes[key] = value

    # Get relationships
    rel_rows = conn.execute(
        """SELECT r.relation_type, e.name, e.entity_type, r.attributes, r.confidence
           FROM entity_relationships r
           JOIN entities e ON r.target_entity = e.id
           WHERE r.source_entity = %s
           ORDER BY r.confidence DESC LIMIT 20""",
        (entity_id,),
    ).fetchall()

    relationships = [
        {"type": r[0], "target": {"name": r[1], "entity_type": r[2]}, "detail": (r[3] or {}).get("detail", ""), "confidence": r[4]}
        for r in rel_rows
    ]

    # Also get reverse relationships (where this entity is the target)
    rev_rows = conn.execute(
        """SELECT r.relation_type, e.name, e.entity_type, r.attributes, r.confidence
           FROM entity_relationships r
           JOIN entities e ON r.source_entity = e.id
           WHERE r.target_entity = %s
           ORDER BY r.confidence DESC LIMIT 20""",
        (entity_id,),
    ).fetchall()

    reverse_relationships = [
        {"type": r[0], "source": {"name": r[1], "entity_type": r[2]}, "detail": (r[3] or {}).get("detail", ""), "confidence": r[4]}
        for r in rev_rows
    ]

    # Get source pages
    page_rows = conn.execute(
        """SELECT p.id, p.title, p.url, pe.frequency, pe.in_title
           FROM page_entities pe JOIN pages p ON pe.page_id = p.id
           WHERE pe.entity_id = %s ORDER BY pe.in_title DESC, pe.frequency DESC LIMIT 5""",
        (entity_id,),
    ).fetchall()

    source_pages = [{"title": p[1], "url": p[2]} for p in page_rows]

    # Minimum data check: need at least 2 attributes or 2 relationships
    if len(attributes) < 1 and len(relationships) < 1:
        return None

    return {
        "entity": {
            "id": entity_id,
            "name": name,
            "type": entity_type,
            "description": description,
        },
        "attributes": attributes,
        "relationships": relationships,
        "reverse_relationships": reverse_relationships,
        "source_pages": source_pages,
    }

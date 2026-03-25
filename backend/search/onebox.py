"""OneBox — assembles rich entity card data from the Knowledge Graph.

Triggered when intent detection identifies an entity_lookup query
and the Knowledge Graph has sufficient data for the entity.
"""
import psycopg

from knowledge.query import get_entity_card


def get_onebox(conn: psycopg.Connection, intent_result: dict) -> dict | None:
    """Get OneBox card data for the primary detected entity.

    Returns None if no entity found or insufficient KG data.
    """
    entities = intent_result.get("entities", [])
    if not entities:
        return None

    # Try the first (longest/best) detected entity
    for entity_name in entities:
        card = get_entity_card(conn, entity_name)
        if card:
            return card

    return None

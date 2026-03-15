"""Query fan-out: expand a user query into multiple sub-queries for better retrieval."""
import re

import httpx

from config import OLLAMA_BASE_URL, OLLAMA_MODEL


def expand_query(query: str) -> list[str]:
    """Expand a user query into 2-3 sub-queries using the LLM.

    Returns the original query plus generated variants.
    Falls back to just the original query if LLM fails.
    """
    prompt = f"""Generate 2 alternative search queries for: "{query}"
Each should find different relevant information. One line per query. No numbering, no explanation. Just the queries.

Queries:"""

    try:
        response = httpx.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "num_predict": 512,
                    "temperature": 0.5,
                },
            },
            timeout=60,
        )
        response.raise_for_status()
        raw = response.json()["response"].strip()

        # Strip thinking tags
        raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()

        # Parse lines into queries
        lines = [line.strip().strip("-•*123.") .strip() for line in raw.split("\n")]
        sub_queries = [line for line in lines if line and len(line) > 3 and len(line) < 200]

        # Always include original query first
        result = [query] + sub_queries[:2]
        return result

    except Exception as e:
        print(f"  Fan-out error: {e}")
        return [query]

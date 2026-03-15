"""Query fan-out: expand a user query into multiple sub-queries for better retrieval."""
import httpx

from config import GROQ_API_KEY, GROQ_MODEL


def expand_query(query: str) -> list[str]:
    """Expand a user query into 2-3 sub-queries using Groq.

    Returns the original query plus generated variants.
    Falls back to just the original query if API fails.
    """
    if not GROQ_API_KEY:
        return [query]

    try:
        response = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": "Generate exactly 2 alternative search queries. One per line. No numbering, no explanation, just the queries.",
                    },
                    {
                        "role": "user",
                        "content": f"Alternative search queries for: {query}",
                    },
                ],
                "max_tokens": 100,
                "temperature": 0.5,
            },
            timeout=5,
        )
        response.raise_for_status()
        raw = response.json()["choices"][0]["message"]["content"].strip()

        lines = [line.strip().strip("-•*123.)") .strip() for line in raw.split("\n")]
        sub_queries = [line for line in lines if line and len(line) > 3 and len(line) < 200]

        return [query] + sub_queries[:2]

    except Exception as e:
        print(f"  Fan-out error: {e}")
        return [query]

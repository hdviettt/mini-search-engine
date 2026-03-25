"""AI Mode — multi-turn conversational search grounded in our index.

Streams responses via SSE. For each user message, searches the index
for relevant chunks and injects them as context for grounded responses
with citations [1], [2], etc.
"""
import json
import time
from typing import Generator

import httpx

from config import GROQ_API_KEY, GROQ_MODEL
from db import get_connection


def _search_index(query: str) -> tuple[str, list[dict]]:
    """Search our index for relevant chunks. Returns (context_text, sources)."""
    try:
        conn = get_connection()
        from rag.embedder import embed_queries
        from rag.retriever import hybrid_retrieve

        embeddings = embed_queries([query])
        chunks, _ = hybrid_retrieve(conn, [query], query_embeddings=embeddings, top_k=5)
        conn.close()

        if not chunks:
            return "", []

        context_parts = []
        sources = []
        for i, chunk in enumerate(chunks[:5], 1):
            title = chunk.get("title", "")
            url = chunk.get("url", "")
            content = chunk.get("content", "")[:500]
            context_parts.append(f"[Source {i}: {title}]\n{content}")
            sources.append({"index": i, "title": title, "url": url})

        return "\n\n".join(context_parts), sources
    except Exception as e:
        print(f"AI Chat index search error: {e}")
        return "", []


SYSTEM_PROMPT = """You are an expert football analyst embedded in a search engine. You provide insightful analysis grounded in the search results provided.

Rules:
- Use the SOURCE DATA below to answer questions. Cite sources as [1], [2], etc.
- Be conversational but authoritative
- Keep responses concise (2-4 paragraphs) unless the user asks for detail
- If the sources don't contain relevant information, say so honestly
- Use **bold** for key names and stats
- Use bullet points for lists"""


def generate_chat_stream(messages: list[dict]) -> Generator[str, None, None]:
    """Stream AI Mode chat responses grounded in our search index."""
    if not GROQ_API_KEY:
        yield f"data: {json.dumps({'type': 'error', 'message': 'AI not configured'})}\n\n"
        return

    total_start = time.time()

    # Build search query from conversation context
    # Combine the original query (first user message) with the latest question
    # so "how tall is he" becomes "Ronaldo how tall is he"
    user_messages = [m["content"] for m in messages if m["role"] == "user"]
    original_topic = user_messages[0] if user_messages else ""
    latest_question = user_messages[-1] if user_messages else ""

    if len(user_messages) > 1 and original_topic.lower() not in latest_question.lower():
        search_query = f"{original_topic} {latest_question}"
    else:
        search_query = latest_question

    t0 = time.time()
    context, sources = _search_index(search_query)
    search_ms = round((time.time() - t0) * 1000, 1)

    # Send sources to frontend for rendering
    if sources:
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources, 'search_ms': search_ms})}\n\n"

    # Build system message with search results
    system_content = SYSTEM_PROMPT
    if context:
        system_content += f"\n\nSOURCE DATA (from our football search index):\n{context}"
    else:
        system_content += "\n\nNo relevant sources found in the index. Answer from general knowledge but note the limitation."

    # Build messages for LLM (keep last 10 for context window)
    llm_messages = [{"role": "system", "content": system_content}]
    for m in messages[-10:]:
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
                "max_tokens": 600,
                "temperature": 0.3,
                "stream": True,
            },
            timeout=20,
        ) as response:
            for line in response.iter_lines():
                if line.startswith("data: ") and line != "data: [DONE]":
                    try:
                        chunk = json.loads(line[6:])
                        delta = chunk["choices"][0].get("delta", {}).get("content", "")
                        if delta:
                            yield f"data: {json.dumps({'type': 'token', 'content': delta})}\n\n"
                    except (json.JSONDecodeError, KeyError, IndexError):
                        pass

            total_ms = round((time.time() - total_start) * 1000, 1)
            yield f"data: {json.dumps({'type': 'done', 'total_ms': total_ms})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

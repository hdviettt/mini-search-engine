import asyncio
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, Query, WebSocket
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from fastapi.responses import StreamingResponse

from db import get_connection
from search.engine import search
from ai_overview.generator import generate_overview, generate_overview_stream
from api.playground import router as playground_router, websocket_jobs

_executor = ThreadPoolExecutor(max_workers=2)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "https://search.hoangducviet.work"],
    allow_origin_regex=r"https://.*\.(up\.railway\.app|hoangducviet\.work)",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(playground_router)


@app.websocket("/ws/jobs")
async def ws_jobs(websocket: WebSocket):
    await websocket_jobs(websocket)

SEARCH_PAGE = """
<!DOCTYPE html>
<html>
<head>
    <title>VietSearch</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0; }

        .home { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; }
        .home h1 { font-size: 3rem; margin-bottom: 1.5rem; color: #e94560; }
        .results-header h1 { font-size: 1.5rem; color: #e94560; cursor: pointer; }
        .results-header { padding: 1rem 2rem; border-bottom: 1px solid #2a2a4a; display: flex; align-items: center; gap: 1.5rem; }

        .search-box { display: flex; gap: 0.5rem; width: 100%; max-width: 600px; }
        .search-box input {
            flex: 1; padding: 0.75rem 1rem; font-size: 1rem; border: 1px solid #3a3a5a;
            border-radius: 24px; outline: none; background: #16213e; color: #e0e0e0;
        }
        .search-box input:focus { border-color: #e94560; }
        .search-box button {
            padding: 0.75rem 1.5rem; font-size: 1rem; border: none; border-radius: 24px;
            background: #e94560; color: white; cursor: pointer;
        }
        .search-box button:hover { background: #c73e54; }

        .results-container { max-width: 700px; margin: 1.5rem auto; padding: 0 1rem; }
        .meta { color: #888; font-size: 0.85rem; margin-bottom: 1rem; }

        .result {
            margin-bottom: 1.5rem; padding: 1rem; background: #16213e;
            border-radius: 8px; border: 1px solid #2a2a4a;
        }
        .result:hover { border-color: #3a3a5a; }
        .result .title { font-size: 1.1rem; color: #e94560; text-decoration: none; display: block; margin-bottom: 0.25rem; }
        .result .title:hover { text-decoration: underline; }
        .result .url { font-size: 0.8rem; color: #0f3460; margin-bottom: 0.4rem; word-break: break-all; }
        .result .snippet { font-size: 0.9rem; color: #b0b0b0; line-height: 1.4; }
        .result .scores { font-size: 0.75rem; color: #666; margin-top: 0.5rem; }
        .score-bar { display: inline-block; height: 6px; border-radius: 3px; margin-right: 0.5rem; vertical-align: middle; }
        .bm25-bar { background: #e94560; }
        .pr-bar { background: #0f3460; }

        .ai-overview {
            margin-bottom: 1.5rem; padding: 1.25rem; background: linear-gradient(135deg, #1a1a3e, #16213e);
            border-radius: 8px; border: 1px solid #3a3a6a; line-height: 1.6;
        }
        .ai-overview .ai-label { font-size: 0.75rem; color: #e94560; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.5rem; }
        .ai-overview .ai-text { font-size: 0.95rem; color: #d0d0d0; }
        .ai-overview .ai-loading { color: #888; font-style: italic; }

        .empty { text-align: center; color: #888; margin-top: 3rem; }
        .loading { text-align: center; color: #888; margin-top: 3rem; }
    </style>
</head>
<body>
    <div id="app"></div>
    <script>
        const app = document.getElementById('app');
        let currentQuery = '';

        function renderHome() {
            app.innerHTML = `
                <div class="home">
                    <h1>VietSearch</h1>
                    <form class="search-box" onsubmit="doSearch(event)">
                        <input type="text" id="q" placeholder="Search football..." autofocus>
                        <button type="submit">Search</button>
                    </form>
                </div>`;
        }

        async function doSearch(e) {
            e.preventDefault();
            const q = document.getElementById('q').value.trim();
            if (!q) return;
            currentQuery = q;

            app.innerHTML = `
                <div class="results-header">
                    <h1 onclick="renderHome()">VietSearch</h1>
                    <form class="search-box" onsubmit="doSearch(event)" style="max-width:500px">
                        <input type="text" id="q" value="${q}" autofocus>
                        <button type="submit">Search</button>
                    </form>
                </div>
                <div class="results-container"><div class="loading">Searching...</div></div>`;

            const resp = await fetch('/api/search?q=' + encodeURIComponent(q));
            const data = await resp.json();
            renderResults(data);

            // Fetch AI Overview async (don't block results)
            if (data.total_results >= 3) {
                const aiResp = await fetch('/api/overview?q=' + encodeURIComponent(q));
                const aiData = await aiResp.json();
                if (aiData.overview) {
                    const overviewEl = document.querySelector('.ai-overview');
                    if (overviewEl) {
                        overviewEl.innerHTML = `<div class="ai-label">AI Overview</div><div class="ai-text">${aiData.overview}</div>`;
                    }
                }
            }
        }

        function renderResults(data) {
            const container = document.querySelector('.results-container');
            if (data.total_results === 0) {
                container.innerHTML = '<div class="empty">No results found.</div>';
                return;
            }

            const maxBm25 = Math.max(...data.results.map(r => r.bm25_score));
            const maxPr = Math.max(...data.results.map(r => r.pagerank_score));

            let html = '';
            if (data.total_results >= 3) {
                html += `<div class="ai-overview"><div class="ai-label">AI Overview</div><div class="ai-loading">Generating...</div></div>`;
            }
            html += `<div class="meta">${data.total_results} results in ${data.time_ms.toFixed(1)}ms</div>`;
            for (const r of data.results) {
                const bm25w = maxBm25 > 0 ? (r.bm25_score / maxBm25 * 100) : 0;
                const prw = maxPr > 0 ? (r.pagerank_score / maxPr * 80) : 0;
                html += `
                    <div class="result">
                        <a class="title" href="${r.url}" target="_blank">${r.title}</a>
                        <div class="url">${r.url}</div>
                        <div class="snippet">${r.snippet}</div>
                        <div class="scores">
                            <span class="score-bar bm25-bar" style="width:${bm25w}px"></span> BM25: ${r.bm25_score}
                            &nbsp;&nbsp;
                            <span class="score-bar pr-bar" style="width:${prw}px"></span> PR: ${r.pagerank_score}
                            &nbsp;&nbsp; Final: ${r.final_score}
                        </div>
                    </div>`;
            }
            container.innerHTML = html;
        }

        renderHome();
    </script>
</body>
</html>
"""


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
def home():
    return SEARCH_PAGE


@app.get("/api/search")
def api_search(q: str = Query(""), page: int = 1, per_page: int = 10):
    conn = get_connection()
    result = search(conn, q, page, per_page)
    # Log query for analytics
    try:
        conn.execute(
            "INSERT INTO query_log (query, results_count, time_ms) VALUES (%s, %s, %s)",
            (q, result.get("total_results", 0), result.get("time_ms", 0)),
        )
        conn.commit()
    except Exception:
        conn.rollback()
    conn.close()
    return result


def _run_overview(q: str):
    conn = get_connection()
    result = generate_overview(conn, q)
    conn.close()
    return result


@app.get("/api/overview")
async def api_overview(q: str = Query("")):
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(_executor, _run_overview, q)
    if result:
        return {
            "query": q,
            "overview": result["overview"],
            "sources": result["sources"],
            "trace": result.get("trace", {}),
            "from_cache": result.get("from_cache", False),
        }
    return {"query": q, "overview": None, "sources": [], "trace": {}, "from_cache": False}


@app.get("/api/overview/stream")
def api_overview_stream(q: str = Query("")):
    conn = get_connection()

    def event_stream():
        try:
            yield from generate_overview_stream(conn, q)
        finally:
            conn.close()

    return StreamingResponse(event_stream(), media_type="text/event-stream")


class ChatRequest(BaseModel):
    messages: list[dict]


@app.post("/api/ai/chat")
def api_ai_chat(req: ChatRequest):
    from ai_overview.chat import generate_chat_stream

    def event_stream():
        yield from generate_chat_stream(req.messages)

    return StreamingResponse(event_stream(), media_type="text/event-stream")

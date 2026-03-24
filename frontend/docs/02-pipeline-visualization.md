# Pipeline Visualization: Interactive Search Engine Diagram

The Explore tab renders an interactive SVG flowchart showing every step of the search pipeline, from crawling to ranked results. Users can click any node to see real trace data from their actual search.

## Diagram Structure

```
BUILD (offline)
  Crawler → Pages DB → Indexer / PageRank / Chunker → Embedder

STORES
  Inverted Index    PR Scores    Vector Store

QUERY (per search)
  Search Query
    ├── Tokenize → Index Lookup → BM25 → PR Lookup → Combine → Neural Rerank → Ranked Results
    └── Fan-out → Embed Query → Vector Search → LLM Synthesis → AI Overview
```

### Node Types
- **Process nodes** (rounded rectangles) — computational steps
- **Store nodes** (cylinders) — persistent data stores
- **I/O nodes** (pills) — inputs and outputs (Search Query, Ranked Results, AI Overview)

### Color Coding
- Green: Build pipeline (crawler, indexer)
- Yellow: Data stores (inverted index, PR scores, vector store)
- Orange: Search pipeline (tokenize, BM25, combine)
- Pink: Neural rerank
- Purple: AI pipeline (fan-out, embed, vector search, LLM)

## Animation

Nodes animate through states as the search pipeline executes:
- **idle** (gray) — not yet reached
- **active** (bright fill) — currently executing
- **done** (normal fill + green dot) — completed

Steps are staggered with 300ms delays to show the pipeline progression. Build nodes start as "ready" (always available). Store nodes activate when their corresponding query step fires.

Animation step order:
```
0: query_input
1: tokenize
2: index_lookup (+ inv_index store)
3: bm25
4: pr_lookup (+ pr_scores store)
5: combine
6: reranker
7: results
8: fanout
9: embed_query
10: vector_search (+ vector_store store)
11: llm
12: ai_overview
```

## Node Detail Panels

Clicking any active/done node opens a detail panel showing real trace data:

- **Tokenize**: input → pre-stem tokens → stems applied → final tokens
- **Index Lookup**: terms found/missing, IDF values, corpus stats
- **BM25 Scoring**: k1, b params, top scores with titles
- **PR Lookup**: damping factor, top PageRank scores
- **Combine**: alpha, formula, rank changes (BM25 → final)
- **Neural Rerank**: model name, candidates, before/after rank changes
- **Fan-out**: original query, expanded queries, timing
- **Embed Query**: queries embedded, dimensions, timing
- **Vector Search**: per-query stats, vector/BM25 chunk counts, scored results
- **LLM Synthesis**: model, provider, timing, output preview

## Mobile Bottom Sheet

On mobile, node details appear as a swipe-to-dismiss bottom sheet:
- Drag handle at top (`touch-none` zone)
- Swipe down past 80px threshold dismisses
- Smooth translateY animation during drag
- Max height 70vh, scrollable content
- Backdrop overlay, tap to dismiss

## SVG Dimensions

- ViewBox: `0 0 770 870`
- Mobile min-width: 380px (scales proportionally)
- Desktop min-width: 500px
- `preserveAspectRatio="xMidYMid meet"` for responsive scaling

## Files

- `frontend/components/PipelineExplorer.tsx` — Main component (~1300 lines)
  - `NODES[]` — node positions, sizes, colors
  - `ARROWS[]` — SVG path definitions for edges
  - `NODE_STEP{}` — animation timing
  - `Flowchart` — SVG rendering
  - `DetailPanel` — node detail content
  - `MobileSheet` — swipe-to-dismiss bottom sheet

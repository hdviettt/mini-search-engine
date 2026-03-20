"use client";

import { useCallback, useEffect, useState } from "react";
import { useReactFlow } from "@xyflow/react";

interface TourStep {
  title: string;
  description: string;
  nodeIds: string[];
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "How Search Engines Work",
    description:
      "This playground visualizes the complete pipeline \u2014 from crawling the web to ranking results. Every node is a real component with real data you can explore.",
    nodeIds: [],
  },
  {
    title: "Crawling the Web",
    description:
      "The Crawler starts from seed URLs and follows links via breadth-first search, storing each page it finds in the Pages DB.",
    nodeIds: ["crawler", "pages_db"],
  },
  {
    title: "Building Indexes",
    description:
      "Offline processors transform raw pages into searchable structures: an inverted index for fast keyword lookup, PageRank scores for authority, and vector embeddings for semantic search.",
    nodeIds: ["indexer", "pr_compute", "chunker", "embedder"],
  },
  {
    title: "The Data Stores",
    description:
      "Four data stores bridge build-time and query-time. They hold everything the search pipeline needs to answer queries in milliseconds.",
    nodeIds: ["inverted_index", "pr_scores", "vector_store", "pages_db"],
  },
  {
    title: "Keyword Search Path",
    description:
      "Queries are tokenized, matched against the inverted index, scored by BM25 (relevance) and PageRank (authority), then combined into a final ranking.",
    nodeIds: ["query_input", "tokenize", "index_lookup", "bm25", "pr_lookup", "combine", "results"],
  },
  {
    title: "AI Overview Path",
    description:
      "In parallel: the query is expanded by an LLM, embedded into vector space, matched via cosine similarity, and synthesized into a cited natural language answer.",
    nodeIds: ["fanout", "embed_query", "vector_search", "llm", "ai_overview"],
  },
  {
    title: "Explore Any Node",
    description:
      "Click any node to inspect its real data \u2014 crawled pages, index terms, authority scores, vector embeddings. Build nodes have operation controls too.",
    nodeIds: ["inverted_index"],
  },
  {
    title: "Try It Out!",
    description:
      'Search using the bar at the top and watch data flow through each node in real time. Try "Messi" or "World Cup" to see the full pipeline animate.',
    nodeIds: [],
  },
];

export default function GuidedTour({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const { fitView } = useReactFlow();

  // Pan to current step's nodes
  useEffect(() => {
    const current = TOUR_STEPS[step];
    if (current.nodeIds.length > 0) {
      fitView({
        nodes: current.nodeIds.map((id) => ({ id })),
        duration: 600,
        padding: 0.3,
      });
    } else {
      fitView({ duration: 600, padding: 0.08 });
    }
  }, [step, fitView]);

  const next = useCallback(() => {
    if (step >= TOUR_STEPS.length - 1) {
      onComplete();
    } else {
      setStep((s) => s + 1);
    }
  }, [step, onComplete]);

  const back = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onComplete();
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [next, back, onComplete]);

  const current = TOUR_STEPS[step];
  const isFirst = step === 0;
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <div className="absolute inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onComplete} />

      {/* Tooltip */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[380px] tour-tooltip">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] p-5">
          {/* Progress bar */}
          <div className="flex items-center gap-1 mb-3">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-[3px] flex-1 transition-colors duration-300 ${
                  i === step
                    ? "bg-[var(--accent)]"
                    : i < step
                      ? "bg-[var(--accent)]/40"
                      : "bg-[var(--border)]"
                }`}
              />
            ))}
          </div>

          {/* Content */}
          <div className="text-[9px] text-[var(--text-dim)] uppercase tracking-wider mb-1 font-mono">
            {step + 1} / {TOUR_STEPS.length}
          </div>
          <h3 className="text-[14px] font-medium text-[var(--text)] mb-2">{current.title}</h3>
          <p className="text-[12px] text-[var(--text-muted)] leading-relaxed mb-5">
            {current.description}
          </p>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <button
              onClick={onComplete}
              className="text-[10px] text-[var(--text-dim)] hover:text-[var(--text-muted)] cursor-pointer transition-colors"
            >
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  onClick={back}
                  className="text-[11px] px-4 py-1.5 border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/30 hover:text-[var(--accent)] cursor-pointer transition-colors"
                >
                  Back
                </button>
              )}
              <button
                onClick={next}
                className="text-[11px] px-5 py-1.5 bg-[var(--accent)] text-white hover:brightness-90 cursor-pointer transition-colors font-medium"
              >
                {isLast ? "Start exploring" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

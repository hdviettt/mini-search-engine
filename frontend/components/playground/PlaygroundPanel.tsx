"use client";

import { useState } from "react";
import { PipelineTrace, SearchParams, CrawlProgressData, IndexProgressData, EmbedProgressData } from "@/lib/types";
import PipelineTab from "./PipelineTab";
import TuningTab from "./TuningTab";
import OperationsTab from "./OperationsTab";
import ExploreTab from "./ExploreTab";

interface PlaygroundPanelProps {
  trace: PipelineTrace | null;
  params: SearchParams;
  onParamsChange: (params: SearchParams) => void;
  crawlProgress: CrawlProgressData | null;
  indexProgress: IndexProgressData | null;
  embedProgress: EmbedProgressData | null;
  logEntries: string[];
  activeCrawlJobId: string | null;
  onCrawlStarted: (jobId: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

type Tab = "pipeline" | "tuning" | "explore" | "operations";

export default function PlaygroundPanel({
  trace, params, onParamsChange, crawlProgress, indexProgress, embedProgress,
  logEntries, activeCrawlJobId, onCrawlStarted, collapsed, onToggle,
}: PlaygroundPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("pipeline");

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-0 top-1/2 -translate-y-1/2 bg-[#111128] border border-[#2a2a4a] border-r-0 rounded-l-lg px-1.5 py-4 text-xs text-gray-500 hover:text-gray-300 cursor-pointer z-20"
        style={{ writingMode: "vertical-rl" }}
      >
        Playground
      </button>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "pipeline", label: "Pipeline" },
    { key: "tuning", label: "Tuning" },
    { key: "explore", label: "Explore" },
    { key: "operations", label: "Ops" },
  ];

  return (
    <div className="w-[380px] shrink-0 border-l border-[#1a1a3a] bg-[#0a0a18] overflow-y-auto h-[calc(100vh-80px)] sticky top-[80px]">
      {/* Tab bar */}
      <div className="flex items-center border-b border-[#1a1a3a]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 text-xs py-2.5 font-medium cursor-pointer transition-colors ${
              activeTab === tab.key
                ? "text-rose-400 border-b-2 border-rose-500"
                : "text-gray-600 hover:text-gray-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button
          onClick={onToggle}
          className="px-2 py-2.5 text-gray-600 hover:text-gray-400 text-xs cursor-pointer"
        >
          &times;
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "pipeline" && <PipelineTab trace={trace} />}
      {activeTab === "tuning" && <TuningTab params={params} onChange={onParamsChange} />}
      {activeTab === "explore" && <ExploreTab />}
      {activeTab === "operations" && (
        <OperationsTab
          crawlProgress={crawlProgress}
          indexProgress={indexProgress}
          embedProgress={embedProgress}
          logEntries={logEntries}
          activeCrawlJobId={activeCrawlJobId}
          onCrawlStarted={onCrawlStarted}
        />
      )}
    </div>
  );
}

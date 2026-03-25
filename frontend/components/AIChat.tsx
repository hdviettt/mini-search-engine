"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { getChatStreamUrl } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";

interface Source {
  index: number;
  title: string;
  url: string;
}

interface AIChatProps {
  initialQuery: string;
  initialOverview: string;
  initialSources?: Source[];
  initialFollowUp?: string;
  onClose: () => void;
}

function SparkleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path d="M12 2L13.5 8.5L18 6L14.5 11L21 12L14.5 13L18 18L13.5 15.5L12 22L10.5 15.5L6 18L9.5 13L3 12L9.5 11L6 6L10.5 8.5L12 2Z" fill="url(#chat-sparkle)" />
      <defs>
        <linearGradient id="chat-sparkle" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5b7bff" />
          <stop offset="0.5" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Render text matching AI Overview style: **bold**, bullets, [N] citations */
function RichText({ text, sources, streaming }: { text: string; sources: Source[]; streaming?: boolean }) {
  const lines = text.split("\n");

  return (
    <div className="text-[14px] sm:text-[15px] leading-[1.65] text-[var(--text)] max-w-2xl">
      {lines.map((line, li) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={li} className="h-2" />;

        const isBullet = /^[-•*]\s/.test(trimmed);
        const content = isBullet ? trimmed.replace(/^[-•*]\s/, "") : trimmed;

        const parts = content.split(/(\*\*[^*]+\*\*|\[\d+\])/).map((part, pi) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={pi}>{part.slice(2, -2)}</strong>;
          }
          const citMatch = part.match(/^\[(\d+)\]$/);
          if (citMatch) {
            const idx = parseInt(citMatch[1]);
            const src = sources.find(s => s.index === idx);
            if (src) {
              return (
                <a key={pi} href={src.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-[18px] h-[18px] text-[10px] font-medium mx-0.5 rounded-full bg-[var(--chip-bg)] hover:bg-[var(--chip-hover)] text-[var(--accent)] cursor-pointer transition-colors align-top"
                  title={src.title}>
                  {idx}
                </a>
              );
            }
          }
          return <span key={pi}>{part}</span>;
        });

        if (isBullet) {
          return (
            <div key={li} className="flex gap-2 ml-1 mb-1">
              <span className="text-[var(--accent)] shrink-0">•</span>
              <span>{parts}</span>
            </div>
          );
        }

        return <p key={li} className="mb-2">{parts}</p>;
      })}
      {streaming && <span className="inline-block w-[3px] h-4 bg-[var(--accent)] animate-pulse ml-0.5 align-middle rounded-sm" />}
    </div>
  );
}

export default function AIChat({ initialQuery, initialOverview, initialSources, initialFollowUp, onClose }: AIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "user", content: initialQuery },
    { role: "assistant", content: initialOverview },
  ]);
  // Pre-populate sources for the initial AI Overview message (index 1 = first assistant msg)
  const [messageSources, setMessageSources] = useState<Record<number, Source[]>>(
    initialSources?.length ? { 1: initialSources.map(s => ({ index: s.index, title: s.title, url: s.url })) } : {}
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const followUpSent = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (initialFollowUp && !followUpSent.current) {
      followUpSent.current = true;
      sendMessage(initialFollowUp);
    }
  }, [initialFollowUp]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: content.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    const assistantIdx = newMessages.length;
    setMessages([...newMessages, { role: "assistant", content: "" }]);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(getChatStreamUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
        signal: controller.signal,
      });

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.type === "sources") {
              setMessageSources(prev => ({ ...prev, [assistantIdx]: msg.sources }));
            } else if (msg.type === "token") {
              fullText += msg.content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: fullText };
                return updated;
              });
            }
          } catch { /* */ }
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    } finally {
      setStreaming(false);
    }
  }, [messages, streaming]);

  return (
    <div className="pt-4 mb-4" style={{ animation: "fade-in 0.3s ease-out" }}>
      {/* Header — matches AI Overview header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SparkleIcon />
          <span className="text-[15px] font-medium text-[var(--text)]">AI Mode</span>
        </div>
        <button onClick={onClose} className="text-[12px] text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer">
          Back to overview
        </button>
      </div>

      {/* Conversation — matches AI Overview text style */}
      <div ref={scrollRef} className="max-h-[65vh] overflow-y-auto">
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "user" && i > 0 && (
              <div className="mt-5 mb-3 pt-4 border-t border-[var(--separator)] flex justify-end">
                <div className="bg-[var(--accent)]/12 text-[var(--text)] text-[14px] px-4 py-2.5 rounded-2xl rounded-br-sm max-w-[85%]">
                  {msg.content}
                </div>
              </div>
            )}
            {msg.role === "assistant" && (
              <div>
                <RichText
                  text={msg.content}
                  sources={messageSources[i] || []}
                  streaming={streaming && i === messages.length - 1}
                />
                {/* Source cards — shown after response finishes */}
                {messageSources[i] && messageSources[i].length > 0 && !(streaming && i === messages.length - 1) && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {messageSources[i].map(s => {
                      let domain = "";
                      try { domain = new URL(s.url).hostname.replace("www.", ""); } catch { domain = ""; }
                      return (
                        <a key={s.index} href={s.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--chip-hover)] transition-colors text-[11px] border border-[var(--border)]">
                          <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} alt="" width={12} height={12} className="rounded-full" />
                          <span className="text-[var(--text-muted)] truncate max-w-[120px]">{s.title}</span>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Follow-up input — matches AI Overview follow-up style */}
      <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="mt-4">
        <div className="flex items-center bg-[var(--bg-elevated)] rounded-full px-4 border border-transparent focus-within:border-[var(--border)] transition-colors">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={streaming ? "Thinking..." : "Ask a follow-up question"}
            disabled={streaming}
            className="flex-1 py-3 bg-transparent text-[var(--text)] text-[14px] placeholder:text-[var(--text-dim)] focus:outline-none disabled:opacity-50"
          />
          <button type="submit" disabled={streaming || !input.trim()}
            className="p-1 text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors cursor-pointer shrink-0 disabled:opacity-30">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="m16 12-4-4-4 4" /><path d="M12 16V8" />
            </svg>
          </button>
        </div>
      </form>

      <p className="text-[12px] text-[var(--text-dim)] mt-3">
        AI-generated answer. Sources from our search index. Please verify critical facts.
      </p>

      {/* Separator — matches AI Overview */}
      <div className="mt-5 border-b border-[var(--separator)]" />
    </div>
  );
}

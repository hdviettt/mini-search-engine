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
  initialFollowUp?: string;
  onClose: () => void;
}

function SparkleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0">
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

/** Render markdown-like text: **bold**, bullet lists, [N] citation chips, paragraphs */
function RichText({ text, sources }: { text: string; sources: Source[] }) {
  const lines = text.split("\n");

  return (
    <div className="text-[14px] sm:text-[15px] leading-[1.65] text-[var(--text)]">
      {lines.map((line, li) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={li} className="h-2" />;

        // Bullet list items
        const isBullet = /^[-•*]\s/.test(trimmed);
        const content = isBullet ? trimmed.replace(/^[-•*]\s/, "") : trimmed;

        // Parse inline formatting
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
              <span className="text-[var(--accent)] shrink-0 mt-0.5">•</span>
              <span>{parts}</span>
            </div>
          );
        }

        return <p key={li} className="mb-2">{parts}</p>;
      })}
    </div>
  );
}

function SourceCards({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;

  return (
    <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
      {sources.map(s => {
        let domain = "";
        try { domain = new URL(s.url).hostname.replace("www.", ""); } catch { domain = ""; }
        return (
          <a key={s.index} href={s.url} target="_blank" rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--chip-hover)] transition-colors text-[12px] border border-[var(--border)]">
            <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} alt="" width={14} height={14} className="rounded-full" />
            <div className="min-w-0">
              <div className="text-[var(--text)] truncate max-w-[150px]">{s.title}</div>
              <div className="text-[var(--text-dim)] truncate">{domain}</div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

export default function AIChat({ initialQuery, initialOverview, initialFollowUp, onClose }: AIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "user", content: initialQuery },
    { role: "assistant", content: initialOverview },
  ]);
  const [messageSources, setMessageSources] = useState<Record<number, Source[]>>({});
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const followUpSent = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  // Auto-send follow-up that triggered AI Mode
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
    <div className="flex flex-col" style={{ animation: "fade-in 0.3s ease-out" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SparkleIcon />
          <span className="text-[15px] font-medium text-[var(--text)]">AI Mode</span>
        </div>
        <button onClick={onClose} className="text-[12px] text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer px-2.5 py-1 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors">
          Exit chat
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "user" ? (
              <div className="flex justify-end">
                <div className="max-w-[85%] bg-[var(--accent)]/12 text-[var(--text)] text-[14px] px-4 py-2.5 rounded-2xl rounded-br-sm">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div>
                <RichText text={msg.content} sources={messageSources[i] || []} />
                {streaming && i === messages.length - 1 && (
                  <span className="inline-block w-[3px] h-4 bg-[var(--accent)] animate-pulse ml-0.5 align-middle rounded-sm" />
                )}
                {messageSources[i] && messageSources[i].length > 0 && !streaming && (
                  <SourceCards sources={messageSources[i]} />
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="mt-4">
        <div className="flex items-center bg-[var(--bg-elevated)] rounded-full px-4 border border-transparent focus-within:border-[var(--border)] transition-colors">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={streaming ? "Thinking..." : "Ask a follow-up..."}
            disabled={streaming}
            className="flex-1 py-3 bg-transparent text-[var(--text)] text-[14px] placeholder:text-[var(--text-dim)] focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="p-1.5 text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors cursor-pointer shrink-0 disabled:opacity-30"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" />
            </svg>
          </button>
        </div>
      </form>

      {/* Disclaimer */}
      <p className="text-[11px] text-[var(--text-dim)] mt-2 text-center">
        AI-generated. Cites sources from our search index. Verify critical facts.
      </p>
    </div>
  );
}

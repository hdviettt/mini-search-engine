"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { getChatStreamUrl } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";

interface AIChatProps {
  initialQuery: string;
  initialOverview: string;
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

export default function AIChat({ initialQuery, initialOverview, onClose }: AIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "user", content: initialQuery },
    { role: "assistant", content: initialOverview },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sportsContext, setSportsContext] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: content.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    // Add empty assistant message for streaming
    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages([...newMessages, assistantMsg]);

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
            if (msg.type === "context" && msg.sports_data) {
              setSportsContext(msg.sports_data);
            } else if (msg.type === "token") {
              fullText += msg.content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: fullText };
                return updated;
              });
            } else if (msg.type === "done") {
              // done
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
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <SparkleIcon />
          <span className="text-[15px] font-medium text-[var(--text)]">AI Mode</span>
          {sportsContext && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">Live data</span>
          )}
        </div>
        <button onClick={onClose} className="text-[12px] text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer px-2 py-1 rounded hover:bg-[var(--bg-elevated)] transition-colors">
          Exit chat
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === "user" ? "flex justify-end" : ""}>
            {msg.role === "user" ? (
              <div className="max-w-[80%] bg-[var(--accent)]/15 text-[var(--text)] text-[14px] px-4 py-2.5 rounded-2xl rounded-br-sm">
                {msg.content}
              </div>
            ) : (
              <div className="text-[14px] sm:text-[15px] leading-[1.65] text-[var(--text)]">
                {msg.content.split("\n").map((line, j) => (
                  <p key={j} className={line ? "mb-2" : "mb-1"}>
                    {line.split(/(\*\*[^*]+\*\*)/).map((part, k) =>
                      part.startsWith("**") && part.endsWith("**")
                        ? <strong key={k}>{part.slice(2, -2)}</strong>
                        : part
                    )}
                  </p>
                ))}
                {streaming && i === messages.length - 1 && (
                  <span className="inline-block w-[3px] h-4 bg-[var(--accent)] animate-pulse ml-0.5 align-middle rounded-sm" />
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Sports context indicator */}
      {sportsContext && (
        <div className="mt-2 text-[11px] text-[var(--text-dim)] bg-[var(--bg-elevated)] rounded-lg px-3 py-2 max-h-20 overflow-y-auto">
          <span className="text-green-400 font-medium">Live data used:</span> {sportsContext.slice(0, 200)}{sportsContext.length > 200 ? "..." : ""}
        </div>
      )}

      {/* Input */}
      <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="mt-3">
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
    </div>
  );
}

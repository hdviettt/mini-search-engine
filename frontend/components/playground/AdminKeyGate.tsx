"use client";

import { useEffect, useState } from "react";
import { ADMIN_KEY_STORAGE, getAdminKey } from "@/lib/api";

/**
 * Operational endpoints (crawl, index, embed, schedules) require an API key.
 *
 * The key is not baked into the bundle — a NEXT_PUBLIC_* variable would be
 * public to every visitor. It is entered here once and kept in localStorage
 * for this browser only, so the demo stays open to everyone while the
 * controls that spend money stay closed.
 */
export default function AdminKeyGate({ onChange }: { onChange?: (hasKey: boolean) => void }) {
  const [stored, setStored] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const key = getAdminKey();
    setStored(key);
    setEditing(!key);
    onChange?.(Boolean(key));
  }, [onChange]);

  const save = () => {
    const key = draft.trim();
    if (!key) return;
    window.localStorage.setItem(ADMIN_KEY_STORAGE, key);
    setStored(key);
    setDraft("");
    setEditing(false);
    onChange?.(true);
  };

  const clear = () => {
    window.localStorage.removeItem(ADMIN_KEY_STORAGE);
    setStored(null);
    setEditing(true);
    onChange?.(false);
  };

  if (stored && !editing) {
    return (
      <div className="flex items-center justify-between gap-2 border border-[var(--border)] px-3 py-2">
        <span className="text-[11px] text-[var(--text-muted)]">
          Admin key set &middot; <span className="font-mono">{"•".repeat(8)}{stored.slice(-3)}</span>
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="text-[10px] font-mono px-2 py-0.5 border border-[var(--border)] hover:border-[var(--border-hover)] cursor-pointer"
          >
            CHANGE
          </button>
          <button
            onClick={clear}
            className="text-[10px] font-mono px-2 py-0.5 border border-[var(--border)] hover:border-[var(--border-hover)] cursor-pointer"
          >
            CLEAR
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 border border-dashed border-[var(--border)] px-3 py-2.5">
      <div className="text-[11px] text-[var(--text-muted)]">
        Operations require an admin key. Stored in this browser only.
      </div>
      <div className="flex gap-1.5">
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="ADMIN_API_KEY"
          autoComplete="off"
          className="flex-1 bg-transparent border border-[var(--border)] px-2 py-1 text-[12px] font-mono outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={save}
          disabled={!draft.trim()}
          className="text-[11px] font-mono px-3 py-1 border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          SAVE
        </button>
        {stored && (
          <button
            onClick={() => setEditing(false)}
            className="text-[11px] font-mono px-2 py-1 border border-[var(--border)] cursor-pointer"
          >
            CANCEL
          </button>
        )}
      </div>
    </div>
  );
}

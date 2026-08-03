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
      <div className="md-card md-card-filled flex items-center justify-between gap-3 !p-3">
        <span className="md-body-small text-[var(--text-muted)]">
          Admin key set &middot;{" "}
          <span className="font-mono">
            {"•".repeat(8)}
            {stored.slice(-3)}
          </span>
        </span>
        <div className="flex gap-1">
          <button onClick={() => setEditing(true)} className="md-btn md-btn-text md-btn-sm">
            Change
          </button>
          <button onClick={clear} className="md-btn md-btn-text md-btn-sm">
            Clear
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="md-card !p-3 space-y-2.5">
      <div className="md-body-small text-[var(--text-muted)]">
        Operations require an admin key. Stored in this browser only.
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="ADMIN_API_KEY"
          autoComplete="off"
          className="md-field md-field-dense flex-1 font-mono"
        />
        <button onClick={save} disabled={!draft.trim()} className="md-btn md-btn-filled md-btn-sm">
          Save
        </button>
        {stored && (
          <button onClick={() => setEditing(false)} className="md-btn md-btn-outlined md-btn-sm">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

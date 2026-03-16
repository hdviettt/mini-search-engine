"use client";

import { useEffect, useState } from "react";
import { listSchedules, createSchedule, deleteSchedule, toggleSchedule, type CrawlSchedule } from "@/lib/api";

export default function CrawlSchedulePanel() {
  const [schedules, setSchedules] = useState<CrawlSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [seedUrl, setSeedUrl] = useState("");
  const [maxPages, setMaxPages] = useState(50);
  const [intervalHours, setIntervalHours] = useState(6);

  const refresh = () => {
    listSchedules().then(setSchedules).finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const handleCreate = async () => {
    if (!seedUrl.trim()) return;
    await createSchedule(
      seedUrl.split("\n").map((u) => u.trim()).filter(Boolean),
      maxPages,
      intervalHours,
    );
    setSeedUrl("");
    setShowForm(false);
    refresh();
  };

  const handleDelete = async (id: string) => {
    await deleteSchedule(id);
    refresh();
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await toggleSchedule(id, !enabled);
    refresh();
  };

  return (
    <div className="p-3 border-t border-[var(--border)]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Scheduled Crawls</div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-[10px] text-[var(--accent)] hover:underline cursor-pointer"
        >
          {showForm ? "Cancel" : "+ New"}
        </button>
      </div>

      {showForm && (
        <div className="space-y-2 mb-3 p-2 border border-dashed border-[var(--border)]">
          <textarea
            value={seedUrl}
            onChange={(e) => setSeedUrl(e.target.value)}
            placeholder="Seed URLs (one per line)"
            className="w-full bg-[var(--bg)] border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--accent)]/50 font-mono resize-none"
            rows={2}
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="text-[9px] text-[var(--text-dim)] mb-0.5">Max pages</div>
              <input
                type="number"
                value={maxPages}
                onChange={(e) => setMaxPages(parseInt(e.target.value) || 50)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text)] outline-none font-mono"
              />
            </div>
            <div className="flex-1">
              <div className="text-[9px] text-[var(--text-dim)] mb-0.5">Every (hours)</div>
              <input
                type="number"
                value={intervalHours}
                onChange={(e) => setIntervalHours(parseInt(e.target.value) || 6)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text)] outline-none font-mono"
              />
            </div>
          </div>
          <button
            onClick={handleCreate}
            className="w-full py-1 text-[10px] font-mono border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent-muted)] cursor-pointer transition-colors"
          >
            Create Schedule
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-[10px] text-[var(--text-dim)]">Loading...</div>
      ) : schedules.length === 0 ? (
        <div className="text-[10px] text-[var(--text-dim)] text-center py-2">No scheduled crawls</div>
      ) : (
        <div className="space-y-1.5">
          {schedules.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-[10px] p-1.5 border border-[var(--border)]">
              <button
                onClick={() => handleToggle(s.id, s.enabled)}
                className={`w-6 h-3 cursor-pointer transition-colors ${s.enabled ? "bg-[var(--accent)]" : "bg-[var(--border-hover)]"}`}
                title={s.enabled ? "Disable" : "Enable"}
              >
                <div className={`w-2.5 h-2.5 bg-white transition-transform ${s.enabled ? "translate-x-3" : "translate-x-0.5"}`} />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-[var(--text-muted)] truncate">{s.max_pages} pages / {s.interval_hours}h</div>
                {s.next_run && <div className="text-[9px] text-[var(--text-dim)]">Next: {new Date(s.next_run).toLocaleTimeString()}</div>}
              </div>
              <button
                onClick={() => handleDelete(s.id)}
                className="text-[var(--text-dim)] hover:text-red-500 cursor-pointer"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

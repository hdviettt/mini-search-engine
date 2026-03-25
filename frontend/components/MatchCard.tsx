"use client";

import type { SportsData, FixtureData, StandingEntry } from "@/lib/types";

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  } catch { return dateStr; }
}

function formatTime(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch { return ""; }
}

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"]);

function FixtureCard({ fixture }: { fixture: FixtureData }) {
  const isLive = LIVE_STATUSES.has(fixture.status);
  const isFinished = fixture.status === "FT" || fixture.status === "AET" || fixture.status === "PEN";

  return (
    <div className="flex items-center gap-3 py-3 border-b border-[var(--separator)] last:border-0">
      {/* Home team */}
      <div className="flex-1 flex items-center gap-2 justify-end">
        <span className="text-[14px] text-[var(--text)] text-right truncate">{fixture.home_team}</span>
        {fixture.home_logo && <img src={fixture.home_logo} alt="" width={24} height={24} className="shrink-0" />}
      </div>

      {/* Score / Time */}
      <div className="w-20 text-center shrink-0">
        {isLive ? (
          <div>
            <div className="text-[18px] font-bold text-[var(--text)]">{fixture.score_home ?? 0} - {fixture.score_away ?? 0}</div>
            <div className="flex items-center justify-center gap-1 text-[11px] text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              {fixture.elapsed}&apos;
            </div>
          </div>
        ) : isFinished ? (
          <div>
            <div className="text-[18px] font-bold text-[var(--text)]">{fixture.score_home} - {fixture.score_away}</div>
            <div className="text-[11px] text-[var(--text-dim)]">FT</div>
          </div>
        ) : (
          <div>
            <div className="text-[14px] font-medium text-[var(--accent)]">{formatTime(fixture.date)}</div>
            <div className="text-[11px] text-[var(--text-dim)]">{formatDate(fixture.date)}</div>
          </div>
        )}
      </div>

      {/* Away team */}
      <div className="flex-1 flex items-center gap-2">
        {fixture.away_logo && <img src={fixture.away_logo} alt="" width={24} height={24} className="shrink-0" />}
        <span className="text-[14px] text-[var(--text)] truncate">{fixture.away_team}</span>
      </div>
    </div>
  );
}

function StandingsTable({ standings }: { standings: StandingEntry[] }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[12px] sm:text-[13px]">
        <thead>
          <tr className="text-[var(--text-dim)] border-b border-[var(--separator)]">
            <th className="text-left py-2 px-1 w-6">#</th>
            <th className="text-left py-2 px-1">Team</th>
            <th className="text-center py-2 px-1 w-8">P</th>
            <th className="text-center py-2 px-1 w-8">W</th>
            <th className="text-center py-2 px-1 w-8">D</th>
            <th className="text-center py-2 px-1 w-8">L</th>
            <th className="text-center py-2 px-1 w-10 hidden sm:table-cell">GD</th>
            <th className="text-center py-2 px-1 w-10 font-semibold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.rank} className={`border-b border-[var(--separator)] last:border-0 ${
              s.rank <= 4 ? "text-[var(--text)]" : "text-[var(--text-muted)]"
            }`}>
              <td className="py-1.5 px-1 text-[var(--text-dim)]">{s.rank}</td>
              <td className="py-1.5 px-1 flex items-center gap-1.5">
                {s.logo && <img src={s.logo} alt="" width={16} height={16} className="shrink-0" />}
                <span className="truncate">{s.team}</span>
              </td>
              <td className="text-center py-1.5 px-1">{s.played}</td>
              <td className="text-center py-1.5 px-1">{s.won}</td>
              <td className="text-center py-1.5 px-1">{s.drawn}</td>
              <td className="text-center py-1.5 px-1">{s.lost}</td>
              <td className="text-center py-1.5 px-1 hidden sm:table-cell">{s.gd > 0 ? `+${s.gd}` : s.gd}</td>
              <td className="text-center py-1.5 px-1 font-semibold">{s.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MatchCard({ data }: { data: SportsData }) {
  if (!data.data || (data.data as unknown[]).length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-5" style={{ animation: "fade-in 0.3s ease-out" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[15px] font-semibold text-[var(--text)]">
          {data.type === "fixtures" && "Upcoming Matches"}
          {data.type === "standings" && "Standings"}
          {data.type === "live" && "Live Scores"}
        </h2>
        <span className="text-[11px] text-[var(--text-dim)] px-2 py-0.5 rounded-full bg-[var(--bg-elevated)]">
          API-Football
        </span>
      </div>

      {data.type === "fixtures" && (
        <div>
          {(data.data as FixtureData[]).map((f) => (
            <FixtureCard key={f.id || `${f.home_team}-${f.away_team}`} fixture={f} />
          ))}
        </div>
      )}

      {data.type === "standings" && (
        <StandingsTable standings={data.data as StandingEntry[]} />
      )}

      {data.type === "live" && (
        <div>
          {(data.data as FixtureData[]).length === 0 ? (
            <p className="text-[13px] text-[var(--text-dim)] py-2">No live matches right now.</p>
          ) : (
            (data.data as FixtureData[]).map((f) => (
              <FixtureCard key={f.id || `${f.home_team}-${f.away_team}`} fixture={f} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

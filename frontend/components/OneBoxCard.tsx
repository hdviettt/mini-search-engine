"use client";

interface OneBoxData {
  entity: { id: number; name: string; type: string; description: string | null };
  attributes: Record<string, string>;
  relationships: { type: string; target: { name: string; entity_type: string }; detail: string; confidence: number }[];
  reverse_relationships: { type: string; source: { name: string; entity_type: string }; detail: string; confidence: number }[];
  source_pages: { title: string; url: string }[];
}

const TYPE_LABELS: Record<string, string> = {
  player: "Player",
  coach: "Coach",
  team: "Team",
  league: "League",
  tournament: "Tournament",
  country: "Country",
  stadium: "Stadium",
  federation: "Federation",
};

const TYPE_COLORS: Record<string, string> = {
  player: "bg-green-500/15 text-green-400",
  coach: "bg-amber-500/15 text-amber-400",
  team: "bg-blue-500/15 text-blue-400",
  league: "bg-purple-500/15 text-purple-400",
  tournament: "bg-red-500/15 text-red-400",
  country: "bg-cyan-500/15 text-cyan-400",
  stadium: "bg-orange-500/15 text-orange-400",
  federation: "bg-indigo-500/15 text-indigo-400",
};

const REL_LABELS: Record<string, string> = {
  PLAYS_FOR: "Plays for",
  PLAYED_FOR: "Played for",
  MANAGES: "Manages",
  COMPETES_IN: "Competes in",
  NATIONALITY: "Nationality",
  WON: "Won",
  LOCATED_IN: "Located in",
};

const ATTR_LABELS: Record<string, string> = {
  nationality: "Nationality",
  position: "Position",
  birth_date: "Born",
  founded_year: "Founded",
  stadium: "Stadium",
  capacity: "Capacity",
  nickname: "Nickname",
};

export default function OneBoxCard({ data }: { data: OneBoxData }) {
  const { entity, attributes, relationships, reverse_relationships, source_pages } = data;
  const typeLabel = TYPE_LABELS[entity.type] || entity.type;
  const typeColor = TYPE_COLORS[entity.type] || "bg-[var(--chip-bg)] text-[var(--text-muted)]";

  // Combine forward + reverse relationships, limit to 5
  const allRels = [
    ...relationships.map(r => ({ label: REL_LABELS[r.type] || r.type, value: r.target.name, detail: r.detail })),
    ...reverse_relationships.map(r => ({ label: `${REL_LABELS[r.type] || r.type} (by)`, value: r.source.name, detail: r.detail })),
  ].slice(0, 5);

  const attrEntries = Object.entries(attributes)
    .map(([k, v]) => ({ label: ATTR_LABELS[k] || k, value: v }))
    .slice(0, 6);

  if (attrEntries.length === 0 && allRels.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 sm:p-5 mb-5" style={{ animation: "fade-in 0.3s ease-out" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[18px] sm:text-[20px] font-semibold text-[var(--text)]">{entity.name}</h2>
        <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${typeColor}`}>
          {typeLabel}
        </span>
      </div>

      {entity.description && (
        <p className="text-[14px] text-[var(--text-muted)] mb-3 leading-relaxed">{entity.description}</p>
      )}

      {/* Attributes */}
      {attrEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
          {attrEntries.map((a, i) => (
            <div key={i} className="flex items-baseline gap-2">
              <span className="text-[12px] text-[var(--text-dim)] shrink-0">{a.label}</span>
              <span className="text-[13px] text-[var(--text)] truncate">{a.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Relationships */}
      {allRels.length > 0 && (
        <div className="border-t border-[var(--separator)] pt-3 space-y-1.5">
          {allRels.map((r, i) => (
            <div key={i} className="flex items-baseline gap-2">
              <span className="text-[12px] text-[var(--text-dim)] shrink-0">{r.label}</span>
              <span className="text-[13px] text-[var(--accent)]">{r.value}</span>
              {r.detail && <span className="text-[11px] text-[var(--text-dim)]">({r.detail})</span>}
            </div>
          ))}
        </div>
      )}

      {/* Sources */}
      {source_pages.length > 0 && (
        <div className="border-t border-[var(--separator)] pt-2.5 mt-3 flex items-center gap-1.5">
          <span className="text-[11px] text-[var(--text-dim)]">Sources:</span>
          <div className="flex items-center -space-x-1">
            {source_pages.slice(0, 4).map((p, i) => {
              let domain = "";
              try { domain = new URL(p.url).hostname.replace("www.", ""); } catch { domain = ""; }
              return (
                <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
                  className="w-5 h-5 rounded-full bg-[var(--bg-elevated)] border border-[var(--bg)] flex items-center justify-center hover:z-10 hover:scale-110 transition-transform"
                  title={p.title}>
                  <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} alt="" width={12} height={12} className="rounded-full" />
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

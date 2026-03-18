import { useState, useEffect } from "react";
import {
  AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import api from "../services/api";
import PageHeader from "../components/PageHeader";
import StatsRow from "../components/StatsRow";

function impactColor(s) {
  if (s >= 7) return "#ef4444";
  if (s >= 5) return "#f97316";
  if (s >= 3) return "#6366f1";
  return "#22c55e";
}

function sevColor(s) {
  if (s >= 8) return "#ef4444";
  if (s >= 6) return "#f97316";
  if (s >= 4) return "#eab308";
  return "#22c55e";
}

function sevCellBg(s) {
  if (s === null || s === undefined) return "rgba(255,255,255,0.04)";
  if (s >= 8) return "rgba(239,68,68,0.80)";
  if (s >= 6) return "rgba(249,115,22,0.70)";
  if (s >= 4) return "rgba(234,179,8,0.65)";
  return "rgba(34,197,94,0.60)";
}

function ImpactBar({ score }) {
  return (
    <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 99 }}>
      <div style={{
        width: `${Math.min((score / 10) * 100, 100)}%`, height: "100%",
        borderRadius: 99, background: impactColor(score), transition: "width 0.4s ease",
      }} />
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "10px 14px", fontSize: 11,
    }}>
      <div style={{ fontFamily: "IBM Plex Mono", color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>{p.name}: {parseFloat(p.value).toFixed(1)}</div>
      ))}
    </div>
  );
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW = ["S","M","T","W","T","F","S"];

function CalendarHeatmap({ severityTimeline }) {
  const dayMap = {};
  (severityTimeline || []).forEach(({ date, severity }) => {
    if (!dayMap[date]) dayMap[date] = { sum: 0, count: 0 };
    dayMap[date].sum += severity;
    dayMap[date].count += 1;
  });

  const today = new Date();
  const start = new Date(today);
  start.setFullYear(start.getFullYear() - 1);
  start.setDate(start.getDate() - start.getDay()); // align to Sunday

  const weeks = [];
  const cur = new Date(start);
  while (cur <= today) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const iso = cur.toISOString().slice(0, 10);
      const entry = dayMap[iso];
      week.push({
        iso,
        month: cur.getMonth(),
        dayNum: cur.getDate(),
        sev: entry ? entry.sum / entry.count : null,
        future: cur > today,
      });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  // month label positions
  const monthMarkers = [];
  weeks.forEach((week, wi) => {
    const m = week[0].month;
    if (wi === 0 || weeks[wi - 1][0].month !== m) {
      monthMarkers.push({ wi, label: MONTH_NAMES[m] });
    }
  });

  const CELL = 13;
  const GAP  = 3;

  return (
    <div>
      {/* Month labels row */}
      <div style={{ display: "flex", marginLeft: 24, marginBottom: 4, position: "relative", height: 16 }}>
        {monthMarkers.map(({ wi, label }) => (
          <span key={label + wi} style={{
            position: "absolute",
            left: wi * (CELL + GAP),
            fontSize: 10, fontFamily: "IBM Plex Mono",
            color: "var(--text-muted)",
          }}>{label}</span>
        ))}
      </div>

      <div style={{ display: "flex", gap: 0 }}>
        {/* Day-of-week column */}
        <div style={{ display: "flex", flexDirection: "column", gap: GAP, marginRight: 6, flexShrink: 0, paddingTop: 0 }}>
          {DOW.map((d, i) => (
            <div key={i} style={{
              width: 12, height: CELL, lineHeight: `${CELL}px`, textAlign: "right",
              fontSize: 9, fontFamily: "IBM Plex Mono",
              color: i % 2 !== 0 ? "var(--text-muted)" : "transparent",
            }}>{d}</div>
          ))}
        </div>

        {/* Week columns */}
        <div style={{ display: "flex", gap: GAP, overflowX: "auto" }}>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: "flex", flexDirection: "column", gap: GAP }}>
              {week.map(({ iso, sev, future, dayNum }) => (
                <div
                  key={iso}
                  title={sev !== null ? `${iso}  severity ${sev.toFixed(1)}` : iso}
                  style={{
                    width: CELL, height: CELL, borderRadius: 3, flexShrink: 0,
                    background: future ? "transparent" : sevCellBg(sev),
                    border: future ? "none" : "1px solid rgba(255,255,255,0.05)",
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, marginLeft: 24 }}>
        <span style={{ fontSize: 9, fontFamily: "IBM Plex Mono", color: "var(--text-muted)" }}>severity:</span>
        {[
          { c: sevCellBg(null), l: "none" },
          { c: sevCellBg(2), l: "low" },
          { c: sevCellBg(5), l: "mid" },
          { c: sevCellBg(7), l: "high" },
          { c: sevCellBg(9), l: "crisis" },
        ].map(({ c, l }) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: CELL, height: CELL, borderRadius: 3, background: c, border: "1px solid rgba(255,255,255,0.06)" }} />
            <span style={{ fontSize: 9, fontFamily: "IBM Plex Mono", color: "var(--text-muted)" }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankingPanel({ title, accent, people, field, label, onSelect }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", borderLeft: `3px solid ${accent}` }}>
        <div style={{ fontSize: 10, fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.1em", color: accent }}>{title}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
      </div>
      {people.length === 0
        ? <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>No data</div>
        : people.map((p, i) => (
          <div key={p.name} onClick={() => onSelect(p)}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 16px", cursor: "pointer",
              borderBottom: i < people.length - 1 ? "1px solid var(--border)" : "none",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <span style={{ fontSize: 10, color: "var(--text-muted)", width: 18, textAlign: "right" }}>#{i + 1}</span>
            <span style={{ fontSize: 13, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: accent }}>{p[field]}</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>entries</span>
          </div>
        ))
      }
    </div>
  );
}

export default function PeopleIntelligence() {
  const [people, setPeople]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.get("/api/people/intelligence")
      .then(r => {
        const p = r.data.people || [];
        setPeople(p);
        if (p.length > 0) setSelected(p[0]);
      })
      .catch(() => setError("Failed to load people intelligence data."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ textAlign: "center", padding: 64, color: "var(--text-muted)", fontFamily: "IBM Plex Mono", fontSize: 12 }}>loading...</div>
  );
  if (error) return (
    <div style={{ textAlign: "center", padding: 64, color: "#f87171" }}>{error}</div>
  );
  if (!people.length) return (
    <div>
      <PageHeader title="People Intelligence" subtitle="Relationship and conflict pattern map" />
      <div style={{ textAlign: "center", padding: 64, color: "var(--text-muted)", fontSize: 13 }}>
        No people detected yet. Add journal entries and let the AI extract entities first.
      </div>
    </div>
  );

  const totalMentions = people.reduce((s, p) => s + p.mention_count, 0);
  const avgSev = (people.reduce((s, p) => s + p.avg_severity, 0) / people.length).toFixed(1);
  const topDistress = [...people].sort((a, b) => b.distress_entries - a.distress_entries).slice(0, 5);
  const topSupport  = [...people].sort((a, b) => b.support_entries  - a.support_entries).slice(0, 5);

  const sel    = selected;
  const selTot = sel?.mention_count || 1;
  const dPct   = sel ? Math.round((sel.distress_entries / selTot) * 100) : 0;
  const sPct   = sel ? Math.round((sel.support_entries  / selTot) * 100) : 0;
  const nPct   = 100 - dPct - sPct;

  return (
    <div>
      <PageHeader
        title="People Intelligence"
        subtitle="Relationship impact scores, conflict patterns, and distress/support rankings"
      />

      <StatsRow stats={[
        { label: "People tracked",  value: people.length,          color: "var(--accent)" },
        { label: "Total mentions",  value: totalMentions,          color: "#8b5cf6" },
        { label: "Avg severity",    value: `${avgSev} / 10`,       color: "var(--severity-color)" },
        { label: "Highest impact",  value: people[0]?.name || "—", color: "#f97316",
          sub: `impact score ${people[0]?.impact_score ?? "—"}` },
      ]} />

      {/* Roster + detail */}
      <div style={{ display: "grid", gridTemplateColumns: "270px 1fr", gap: 16, marginBottom: 16 }}>

        {/* Roster list */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>Impact ranking</div>
          </div>
          <div style={{ maxHeight: 580, overflowY: "auto" }}>
            {people.map((person, i) => (
              <div key={person.name} onClick={() => setSelected(person)}
                style={{
                  padding: "10px 16px", cursor: "pointer",
                  background: sel?.name === person.name ? "rgba(99,102,241,0.10)" : "transparent",
                  borderLeft: sel?.name === person.name ? "2px solid var(--accent)" : "2px solid transparent",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { if (sel?.name !== person.name) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={e => { if (sel?.name !== person.name) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", width: 18, textAlign: "right" }}>#{i + 1}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {person.name}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                    color: impactColor(person.impact_score),
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${impactColor(person.impact_score)}44`,
                  }}>{person.impact_score.toFixed(1)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 26 }}>
                  <ImpactBar score={person.impact_score} />
                  <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>{person.mention_count}×</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detail */}
        {sel && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Header card */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 20, color: "var(--text-primary)", margin: 0 }}>{sel.name}</h2>
                  <div style={{ fontSize: 10, fontFamily: "IBM Plex Mono", color: "var(--text-muted)", marginTop: 4 }}>
                    first {sel.first_mention} · last {sel.last_mention}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 34, fontFamily: "Syne", fontWeight: 800, color: impactColor(sel.impact_score), lineHeight: 1 }}>
                    {sel.impact_score.toFixed(1)}
                  </div>
                  <div style={{ fontSize: 9, fontFamily: "IBM Plex Mono", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>impact score</div>
                </div>
              </div>

              {/* Stats grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
                {[
                  { label: "mentions",         value: sel.mention_count,        color: "var(--accent)" },
                  { label: "avg severity",     value: `${sel.avg_severity}/10`, color: sevColor(sel.avg_severity) },
                  { label: "distress entries", value: sel.distress_entries,     color: "#ef4444" },
                  { label: "support entries",  value: sel.support_entries,      color: "#22c55e" },
                ].map(s => (
                  <div key={s.label} style={{
                    background: "var(--bg-base)", border: "1px solid var(--border)",
                    borderTop: `2px solid ${s.color}`, borderRadius: 8, padding: "10px 12px",
                  }}>
                    <div style={{ fontSize: 9, fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 20, fontFamily: "Syne", fontWeight: 700, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Sentiment bar */}
              <div>
                <div style={{ fontSize: 9, fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 6 }}>entry sentiment breakdown</div>
                <div style={{ display: "flex", height: 5, borderRadius: 99, overflow: "hidden" }}>
                  {dPct > 0 && <div style={{ width: `${dPct}%`, background: "#ef4444", transition: "width 0.4s" }} />}
                  {nPct > 0 && <div style={{ width: `${nPct}%`, background: "rgba(255,255,255,0.08)", transition: "width 0.4s" }} />}
                  {sPct > 0 && <div style={{ width: `${sPct}%`, background: "#22c55e", transition: "width 0.4s" }} />}
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                  <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono", color: "#ef4444" }}>● distress {dPct}%</span>
                  <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono", color: "var(--text-muted)" }}>● neutral {nPct}%</span>
                  <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono", color: "#22c55e" }}>● support {sPct}%</span>
                </div>
              </div>
            </div>

            {/* Severity area chart */}
            {sel.severity_timeline?.length >= 2 && (
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px" }}>
                <div style={{ fontSize: 10, fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 12 }}>
                  severity over time when mentioned
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={sel.severity_timeline} margin={{ top: 4, right: 4, bottom: 4, left: -16 }}>
                    <defs>
                      <linearGradient id="sevGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="var(--severity-color)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--severity-color)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "IBM Plex Mono" }} interval="preserveStartEnd" />
                    <YAxis domain={[0, 10]} tick={{ fill: "var(--text-muted)", fontSize: 10 }} width={28} />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine y={7} stroke="rgba(239,68,68,0.2)" strokeDasharray="4 4" />
                    <ReferenceLine y={5} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                    <Area type="monotone" dataKey="severity" name="severity"
                      stroke="var(--severity-color)" strokeWidth={2}
                      fill="url(#sevGrad)" dot={false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Calendar heatmap */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px" }}>
              <div style={{ fontSize: 10, fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 14 }}>
                activity heatmap — last 12 months
              </div>
              <CalendarHeatmap severityTimeline={sel.severity_timeline} />
            </div>

          </div>
        )}
      </div>

      {/* Rankings */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <RankingPanel title="Most associated with distress" accent="#ef4444"
          people={topDistress} field="distress_entries" label="entries where severity >= 7" onSelect={setSelected} />
        <RankingPanel title="Most associated with support"  accent="#22c55e"
          people={topSupport}  field="support_entries"  label="entries where severity <= 4" onSelect={setSelected} />
      </div>
    </div>
  );
}

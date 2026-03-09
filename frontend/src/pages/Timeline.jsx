import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";

// ── Palette helpers ───────────────────────────────────────────────────────────

const MOOD_PALETTE = {
  positive:  { color: "#34d399", bg: "rgba(52,211,153,0.08)",  border: "rgba(52,211,153,0.2)"  },
  elevated:  { color: "#38bdf8", bg: "rgba(56,189,248,0.08)",  border: "rgba(56,189,248,0.2)"  },
  neutral:   { color: "#94a3b8", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.2)" },
  low:       { color: "#fbbf24", bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.2)"  },
  negative:  { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.2)" },
  sad:       { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.2)" },
  melancholy:{ color: "#a78bfa", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.2)" },
  anxious:   { color: "#fb923c", bg: "rgba(251,146,60,0.08)",  border: "rgba(251,146,60,0.2)"  },
};
function moodPalette(label) {
  return MOOD_PALETTE[(label || "neutral").toLowerCase()] || MOOD_PALETTE.neutral;
}
function severityColor(s) {
  if (!s) return "#475569";
  if (s >= 8) return "#ef4444";
  if (s >= 6) return "#f59e0b";
  if (s >= 4) return "#eab308";
  return "#22c55e";
}
function safeJson(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function SeverityBar({ value }) {
  const pct = value ? Math.min(100, (value / 10) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#64748b" }}>
      <span style={{ width: 52, flexShrink: 0 }}>Severity</span>
      <div style={{ flex: 1, height: 3, background: "#1e293b", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: severityColor(value), borderRadius: 99 }} />
      </div>
      <span style={{ width: 24, textAlign: "right" }}>{value ? value.toFixed(1) : "–"}</span>
    </div>
  );
}

function EntryCard({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const tags     = safeJson(entry.tags);
  const events   = safeJson(entry.key_events);
  const quotes   = safeJson(entry.notable_quotes);
  const entities = safeJson(entry.entities);

  const PERSON_TYPES = new Set(["person", "human", "individual"]);
  const people = entities.filter(e => PERSON_TYPES.has((e.type || e.entity_type || "").toLowerCase()));
  const topics = entities.filter(e => !PERSON_TYPES.has((e.type || e.entity_type || "").toLowerCase()));
  const palette = moodPalette(entry.mood_label);

  return (
    <div
      onClick={() => setExpanded(v => !v)}
      style={{
        background: "#10101e",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        cursor: "pointer",
        marginBottom: 8,
        transition: "border-color 0.15s",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"}
    >
      <div style={{ display: "flex", gap: 16, padding: "14px 16px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 52, paddingTop: 2 }}>
          <span style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b" }}>
            {entry.entry_date ? entry.entry_date.slice(5) : ""}
          </span>
          <span style={{ fontSize: 10, color: "#475569" }}>
            {entry.entry_date ? entry.entry_date.slice(0, 4) : ""}
          </span>
          <span style={{
            color: "#475569", marginTop: 6, fontSize: 16,
            display: "inline-block",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}>›</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 8 }}>
            {entry.mood_label && (
              <span style={{
                fontSize: 11, fontWeight: 500, padding: "2px 10px", borderRadius: 99,
                color: palette.color, background: palette.bg, border: `1px solid ${palette.border}`,
              }}>{entry.mood_label}</span>
            )}
            {entry.mood_score != null && (
              <span style={{ fontSize: 11, color: "#64748b" }}>
                {entry.mood_score > 0 ? "+" : ""}{Number(entry.mood_score).toFixed(1)}
              </span>
            )}
            {tags.slice(0, 5).map((t, i) => (
              <span key={i} style={{
                fontSize: 10, color: "#94a3b8",
                background: "#1e293b", padding: "2px 8px", borderRadius: 99,
              }}>
                {typeof t === "string" ? t : t.name || t.label || ""}
              </span>
            ))}
          </div>
          <p style={{
            fontSize: 13, color: "#cbd5e1", lineHeight: 1.65, margin: 0,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: expanded ? "unset" : 2,
            WebkitBoxOrient: "vertical",
          }}>
            {entry.summary_text || "No summary."}
          </p>
          <div style={{ marginTop: 10 }}>
            <SeverityBar value={entry.severity} />
          </div>
        </div>
      </div>

      {expanded && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "14px 16px 16px 84px" }}
        >
          {events.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#475569", margin: "0 0 8px" }}>
                Key Events
              </p>
              {events.map((ev, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                  <span style={{ color: "#334155", flexShrink: 0 }}>•</span>
                  <span style={{ fontSize: 13, color: "#cbd5e1" }}>
                    {typeof ev === "string" ? ev : ev.description || ev.text || JSON.stringify(ev)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {quotes.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#475569", margin: "0 0 8px" }}>
                Notable Quotes
              </p>
              {quotes.map((q, i) => (
                <blockquote key={i} style={{
                  borderLeft: "2px solid rgba(99,102,241,0.4)",
                  paddingLeft: 12, margin: "0 0 6px",
                  fontSize: 13, color: "#94a3b8", fontStyle: "italic",
                }}>
                  {typeof q === "string" ? q : q.text || JSON.stringify(q)}
                </blockquote>
              ))}
            </div>
          )}
          {(people.length > 0 || topics.length > 0) && (
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 12 }}>
              {people.length > 0 && (
                <div>
                  <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#475569", margin: "0 0 6px" }}>People</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {people.map((p, i) => (
                      <span key={i} style={{
                        fontSize: 11, padding: "2px 10px", borderRadius: 99,
                        background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", color: "#a5b4fc",
                      }}>{p.name}</span>
                    ))}
                  </div>
                </div>
              )}
              {topics.length > 0 && (
                <div>
                  <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#475569", margin: "0 0 6px" }}>Topics</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {topics.map((t, i) => (
                      <span key={i} style={{
                        fontSize: 11, padding: "2px 10px", borderRadius: 99,
                        background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)", color: "#d8b4fe",
                      }}>{t.name}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <p style={{ fontSize: 10, color: "#334155", margin: 0 }}>
            {entry.word_count ? `${entry.word_count.toLocaleString()} words` : ""}
            {entry.ingested_at ? ` · ${new Date(entry.ingested_at).toLocaleDateString()}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function MoodSparkline({ data }) {
  if (!data || data.length < 2) return null;
  const scores = data.map(d => d.mood_score ?? 0);
  const min = Math.min(...scores), max = Math.max(...scores);
  const range = max - min || 1;
  const W = 180, H = 36;
  const pts = scores.map((s, i) => {
    const x = (i / (scores.length - 1)) * W;
    const y = H - ((s - min) / range) * (H - 6) - 3;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={W} height={H} style={{ opacity: 0.8 }}>
      <defs>
        <linearGradient id="spark" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke="url(#spark)"
        strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Master Summary Panel ──────────────────────────────────────────────────────

function MasterSummaryPanel({ summary }) {
  const [expanded, setExpanded] = useState(false);
  if (!summary) return null;

  const themes   = safeJson(summary.key_themes);
  const people   = safeJson(summary.key_people);
  const threads  = safeJson(summary.active_threads);
  const patterns = safeJson(summary.notable_patterns);
  const accent   = "var(--accent, #6366f1)";

  return (
    <div style={{
      background: "#10101e",
      border: "1px solid rgba(255,255,255,0.06)",
      borderTop: `2px solid ${accent}`,
      borderRadius: 12,
      marginBottom: 16,
      overflow: "hidden",
    }}>
      {/* Header — always visible */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>
            Living Summary
          </span>
        </div>
        <span style={{
          color: "#475569", fontSize: 16,
          transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 0.15s",
          display: "inline-block",
        }}>›</span>
      </div>

      {/* Current state — always visible as the "teaser" */}
      {summary.current_state && (
        <div style={{
          padding: "0 18px 14px",
          borderBottom: expanded ? "1px solid rgba(255,255,255,0.05)" : "none",
        }}>
          <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", margin: "0 0 6px" }}>
            Current State
          </p>
          <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>
            {summary.current_state}
          </p>
        </div>
      )}

      {/* Expanded sections */}
      {expanded && (
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 20 }}>

          {summary.overall_arc && (
            <div>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", margin: "0 0 6px" }}>
                Overall Arc
              </p>
              <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>
                {summary.overall_arc}
              </p>
            </div>
          )}

          {themes.length > 0 && (
            <div>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", margin: "0 0 8px" }}>
                Key Themes
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {themes.map((t, i) => (
                  <span key={i} style={{
                    fontSize: 11, padding: "3px 10px", borderRadius: 99,
                    background: "rgba(99,102,241,0.08)",
                    border: "1px solid rgba(99,102,241,0.2)",
                    color: "#a5b4fc",
                  }}>
                    {typeof t === "string" ? t : t.theme || JSON.stringify(t)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {threads.length > 0 && (
            <div>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", margin: "0 0 8px" }}>
                Active Threads
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {threads.map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 8 }}>
                    <span style={{ color: accent, flexShrink: 0, fontSize: 12, paddingTop: 1 }}>◎</span>
                    <span style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.6 }}>
                      {typeof t === "string" ? t : t.thread || JSON.stringify(t)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {patterns.length > 0 && (
            <div>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", margin: "0 0 8px" }}>
                Notable Patterns
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {patterns.map((p, i) => (
                  <div key={i} style={{ display: "flex", gap: 8 }}>
                    <span style={{ color: "#f59e0b", flexShrink: 0, fontSize: 11, paddingTop: 2 }}>◆</span>
                    <span style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.6 }}>
                      {typeof p === "string" ? p : p.pattern || JSON.stringify(p)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {people.length > 0 && (
            <div>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", margin: "0 0 8px" }}>
                Key People
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {people.map((p, i) => {
                  const name   = typeof p === "string" ? p : p.name || "Unknown";
                  const detail = typeof p === "object" ? (p.role || p.recent || "") : "";
                  return (
                    <span key={i} title={detail} style={{
                      fontSize: 11, padding: "3px 10px", borderRadius: 99,
                      background: "rgba(168,85,247,0.08)",
                      border: "1px solid rgba(168,85,247,0.2)",
                      color: "#d8b4fe",
                    }}>{name}</span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tone definitions ──────────────────────────────────────────────────────────

const TONES = [
  {
    id:      "therapist",
    label:   "Therapist",
    emoji:   "🪑",
    color:   "#a78bfa",
    border:  "rgba(167,139,250,0.3)",
    bg:      "rgba(167,139,250,0.08)",
    blurb:   "Warm, reflective, clinically aware",
  },
  {
    id:      "best_friend",
    label:   "Best Friend",
    emoji:   "💬",
    color:   "#34d399",
    border:  "rgba(52,211,153,0.3)",
    bg:      "rgba(52,211,153,0.08)",
    blurb:   "Real talk, no filter, genuinely on your side",
  },
  {
    id:      "coach",
    label:   "Coach",
    emoji:   "⚡",
    color:   "#38bdf8",
    border:  "rgba(56,189,248,0.3)",
    bg:      "rgba(56,189,248,0.08)",
    blurb:   "Forward-looking, challenge-oriented, practical",
  },
  {
    id:      "mentor",
    label:   "Mentor",
    emoji:   "🌿",
    color:   "#fbbf24",
    border:  "rgba(251,191,36,0.3)",
    bg:      "rgba(251,191,36,0.08)",
    blurb:   "Big-picture wisdom, patterns across time",
  },
  {
    id:      "inner_critic",
    label:   "Inner Critic",
    emoji:   "🔍",
    color:   "#f87171",
    border:  "rgba(248,113,113,0.3)",
    bg:      "rgba(248,113,113,0.08)",
    blurb:   "Honest mirror — what you might be avoiding",
  },
  {
    id:      "chaos_agent",
    label:   "Chaos Agent",
    emoji:   "🔥",
    color:   "#fb923c",
    border:  "rgba(251,146,60,0.3)",
    bg:      "rgba(251,146,60,0.08)",
    blurb:   "Unhinged, profane, accidentally insightful (18+)",
  },
];

// ── Therapist Insight Box ─────────────────────────────────────────────────────

function TherapistInsight() {
  // cache keyed by tone — always reflects on most recent entry
  const [cache, setCache]           = useState({});
  const [activeTone, setActiveTone] = useState("therapist");
  const [dateRange, setDateRange]   = useState(null);
  const [entryCount, setEntryCount] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const fetchedRef = useRef(false);
  // token + cache metadata per tone
  const [meta, setMeta] = useState({});

  const toneObj     = TONES.find(t => t.id === activeTone);
  const current     = cache[activeTone];
  const borderColor = toneObj?.border || "rgba(167,139,250,0.3)";
  const accentColor = toneObj?.color  || "#a78bfa";

  // Auto-load cached insight on mount — use preferred_tone from memory if set
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    let resolvedTone = "therapist";
    api.get("/api/memory")
      .then(r => { resolvedTone = r.data?.memory?.preferred_tone || "therapist"; setActiveTone(resolvedTone); })
      .catch(() => {})
      .finally(() => {
        api.post("/api/therapist/insight", { force: false, tone: resolvedTone })
          .then(res => {
            const d = res.data;
            if (d.insight) {
              setDateRange(d.entry_date);
              setEntryCount(d.entry_count);
              setCache(prev => ({ ...prev, [resolvedTone]: { insight: d.insight, generatedAt: d.generated_at } }));
              setMeta(prev => ({ ...prev, [resolvedTone]: { cached: d.cached, inputTokens: d.input_tokens, outputTokens: d.output_tokens, hash: d.source_hash } }));
            }
          })
          .catch(() => {});
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = useCallback(async (tone, force = false) => {
    if (loading) return;
    if (!force && cache[tone]) {
      setActiveTone(tone);
      return;
    }
    setActiveTone(tone);
    setLoading(true);
    setError(null);
    try {
      const res = await api.post("/api/therapist/insight", { force, tone });
      const d = res.data;
      setDateRange(d.entry_date);
      setEntryCount(d.entry_count);
      setCache(prev => ({ ...prev, [tone]: { insight: d.insight, generatedAt: d.generated_at } }));
      setMeta(prev => ({ ...prev, [tone]: { cached: d.cached, inputTokens: d.input_tokens, outputTokens: d.output_tokens, hash: d.source_hash } }));
    } catch {
      setError("Could not generate — check API logs.");
    } finally {
      setLoading(false);
    }
  }, [loading, cache]);

  const hasSomething = current?.insight;

  return (
    <div style={{
      background: "#0d0d1a",
      border: `1px solid ${borderColor}`,
      borderTop: `2px solid ${accentColor}`,
      borderRadius: 12,
      marginBottom: 16,
      overflow: "hidden",
      transition: "border-color 0.2s, border-top-color 0.2s",
    }}>

      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "13px 18px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15 }}>{toneObj?.emoji}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>Reflection</span>
          {dateRange && (
            <span style={{
              fontSize: 10, color: "#475569",
              background: "#1e293b", padding: "2px 8px", borderRadius: 99,
            }}>{dateRange}</span>
          )}
          {entryCount != null && (
            <span style={{ fontSize: 10, color: "#334155" }}>
              {entryCount} {entryCount === 1 ? "entry" : "entries"} · last 14 days
            </span>
          )}
        </div>
        {hasSomething && (
          <button
            onClick={() => generate(activeTone, true)}
            disabled={loading}
            style={{
              fontSize: 11, padding: "3px 10px", borderRadius: 8,
              background: "transparent",
              border: `1px solid ${borderColor}`,
              color: loading ? "#334155" : accentColor,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "color 0.2s",
            }}
          >{loading ? "…" : "Refresh"}</button>
        )}
      </div>

      {/* ── Tone picker ─────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 6, padding: "10px 18px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        flexWrap: "wrap",
      }}>
        {TONES.map(tone => {
          const isActive = tone.id === activeTone;
          const isCached = !!cache[tone.id];
          return (
            <button
              key={tone.id}
              onClick={() => generate(tone.id, false)}
              disabled={loading}
              title={tone.blurb}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 11, padding: "4px 12px", borderRadius: 99,
                background: isActive ? tone.bg : "transparent",
                border: `1px solid ${isActive ? tone.border : "rgba(255,255,255,0.06)"}`,
                color: isActive ? tone.color : "#475569",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.15s",
              }}
            >
              <span>{tone.emoji}</span>
              <span style={{ fontWeight: isActive ? 600 : 400 }}>{tone.label}</span>
              {isCached && !isActive && (
                <span style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: tone.color, opacity: 0.6,
                  display: "inline-block", marginLeft: 2,
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tone blurb ──────────────────────────────────────── */}
      <div style={{ padding: "8px 18px 0", minHeight: 26 }}>
        <span style={{ fontSize: 11, color: "#334155", fontStyle: "italic" }}>
          {toneObj?.blurb}
        </span>
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      {loading && (
        <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 10 }}>
          <InsightSpinner color={accentColor} />
          <span style={{ fontSize: 13, color: "#475569" }}>
            {toneObj?.emoji} Generating {toneObj?.label?.toLowerCase()} perspective…
          </span>
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: "12px 18px" }}>
          <p style={{ fontSize: 13, color: "#f87171", margin: 0 }}>{error}</p>
        </div>
      )}

      {hasSomething && !loading && (
        <div style={{ padding: "14px 18px 16px" }}>
          {current.insight.split(/\n\n+/).filter(Boolean).map((para, i, arr) => (
            <p key={i} style={{
              fontSize: 13, color: "#cbd5e1", lineHeight: 1.8, margin: 0,
              marginBottom: i < arr.length - 1 ? 12 : 0,
            }}>
              {para.trim()}
            </p>
          ))}
          <p style={{ fontSize: 10, color: "#2d3748", margin: "12px 0 0" }}>
            {(() => {
              const m = meta[activeTone];
              const parts = [`last 14 days`, `${entryCount} ${entryCount === 1 ? "entry" : "entries"}`];
              if (m?.cached) parts.push("✓ cached");
              if (m?.inputTokens) parts.push(`${m.inputTokens.toLocaleString()} in / ${(m.outputTokens||0).toLocaleString()} out tokens`);
              return parts.join(" · ");
            })()}
          </p>
        </div>
      )}

      {!hasSomething && !loading && !error && (
        <div style={{ padding: "14px 18px 16px" }}>
          <p style={{ fontSize: 13, color: "#334155", margin: "0 0 10px" }}>
            Generate a reflection on your most recent entry.
          </p>
          <button
            onClick={() => generate(activeTone, true)}
            style={{
              fontSize: 12, padding: "6px 16px", borderRadius: 8,
              background: toneObj?.bg,
              border: `1px solid ${toneObj?.border}`,
              color: toneObj?.color,
              cursor: "pointer",
            }}
          >
            {toneObj?.emoji} Generate {toneObj?.label} reflection
          </button>
        </div>
      )}
    </div>
  );
}

function InsightSpinner({ color = "#a78bfa" }) {
  return (
    <div style={{
      width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
      border: `2px solid ${color}30`,
      borderTopColor: color,
      animation: "spin 0.8s linear infinite",
    }} />
  );
}



// ── Exit Plan Offer Banner ────────────────────────────────────────────────────

const SIGNAL_LABELS = {
  safety:    "Safety concerns",
  children:  "Co-parenting / children",
  financial: "Financial independence",
  housing:   "Housing / relocation",
  pets:      "Pet safety",
};

function ExitPlanOfferBanner({ offer, onDismiss }) {
  const navigate = useNavigate();
  const [dismissing, setDismissing] = useState(false);

  if (!offer?.show_offer) return null;

  const signals = offer.detected_signals || [];

  async function handleDismiss() {
    setDismissing(true);
    try { await api.post("/api/exit-plan/dismiss"); } catch {}
    onDismiss();
  }

  return (
    <div style={{
      background: "rgba(251,191,36,0.06)",
      border: "1px solid rgba(251,191,36,0.22)",
      borderLeft: "3px solid #fbbf24",
      borderRadius: 12,
      padding: "14px 18px",
      marginBottom: 16,
      display: "flex",
      alignItems: "flex-start",
      gap: 14,
    }}>
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>🗺️</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#fde68a", margin: "0 0 4px" }}>
          Your journal suggests you may be navigating a major life transition
        </p>
        {signals.length > 0 && (
          <p style={{ fontSize: 12, color: "#92400e", margin: "0 0 10px" }}>
            Detected: {signals.map(s => SIGNAL_LABELS[s] || s).join(" · ")}
          </p>
        )}
        {signals.length === 0 && (
          <p style={{ fontSize: 12, color: "#78716c", margin: "0 0 10px" }}>
            Pattern analysis flagged signals across recent entries.
          </p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => navigate("/exit-plan")}
            style={{
              fontSize: 12, padding: "5px 14px", borderRadius: 8,
              background: "rgba(251,191,36,0.15)",
              border: "1px solid rgba(251,191,36,0.35)",
              color: "#fbbf24", cursor: "pointer", fontWeight: 500,
            }}
          >
            View Exit Planning →
          </button>
          <button
            onClick={handleDismiss}
            disabled={dismissing}
            style={{
              fontSize: 12, padding: "5px 14px", borderRadius: 8,
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#64748b", cursor: "pointer",
            }}
          >
            {dismissing ? "Dismissing…" : "Dismiss"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ── Main Timeline ─────────────────────────────────────────────────────────────

export default function Timeline({ filters }) {
  const [entries, setEntries]       = useState([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(0);
  const [loading, setLoading]       = useState(true);
  const [sparkData, setSparkData]   = useState([]);
  const [masterSummary, setMasterSummary] = useState(null);
  const [exitOffer, setExitOffer]   = useState(null);
  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      if (filters?.start_date)           params.start_date   = filters.start_date;
      if (filters?.end_date)             params.end_date     = filters.end_date;
      if (filters?.mood)                 params.mood         = filters.mood;
      if (filters?.search)               params.search       = filters.search;
      if (filters?.severity_min != null) params.severity_min = filters.severity_min;
      if (filters?.severity_max != null) params.severity_max = filters.severity_max;
      const res = await api.get("/api/entries", { params });
      setEntries(res.data.entries || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error("Failed to load entries", err);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { setPage(0); }, [filters]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get("/api/mood/trend", { params: { days: 60 } })
      .then(r => setSparkData(r.data.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.get("/api/summary/master")
      .then(r => setMasterSummary(r.data.data || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.get("/api/exit-plan/detect")
      .then(r => setExitOffer(r.data))
      .catch(() => {});
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const accent = "var(--accent, #6366f1)";

  const avgMood = entries.length
    ? (entries.reduce((a, e) => a + (e.mood_score ?? 0), 0) / entries.length).toFixed(2) : "—";
  const withSev = entries.filter(e => e.severity);
  const avgSev  = withSev.length
    ? (withSev.reduce((a, e) => a + e.severity, 0) / withSev.length).toFixed(1) : "—";

  const activeFilters = filters ? Object.entries(filters).filter(([, v]) => v) : [];

  return (
    <div style={{ padding: 24 }}>

      {/* ── Master Summary Panel ─────────────────────────── */}
      <MasterSummaryPanel summary={masterSummary} />

      {/* ── Therapist Insight ────────────────────────────── */}
      <TherapistInsight />

      {/* ── Exit Plan Offer Banner ───────────────────────── */}
      <ExitPlanOfferBanner offer={exitOffer} onDismiss={() => setExitOffer(null)} />

      {/* ── Stats row ────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { label: "Total Entries", value: total },
          { label: "This Page",     value: entries.length },
          { label: "Avg Mood",      value: avgMood },
          { label: "Avg Severity",  value: avgSev },
        ].map(s => (
          <div key={s.label} style={{
            background: "#10101e",
            border: "1px solid rgba(255,255,255,0.05)",
            borderTop: `2px solid ${accent}`,
            borderRadius: 12,
            padding: "14px 16px",
          }}>
            <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 4px" }}>{s.label}</p>
            <p style={{ fontSize: 22, fontWeight: 600, color: "#fff", margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Sparkline ────────────────────────────────────── */}
      {sparkData.length > 1 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          background: "#10101e", border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: 12, padding: "10px 16px", marginBottom: 16,
        }}>
          <span style={{ fontSize: 11, color: "#64748b", flexShrink: 0 }}>Mood trend</span>
          <MoodSparkline data={sparkData} />
          <span style={{ fontSize: 11, color: "#334155", marginLeft: "auto" }}>
            last {sparkData.length} entries
          </span>
        </div>
      )}

      {/* ── Active filter chips ───────────────────────────── */}
      {activeFilters.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: "#475569" }}>Filtered:</span>
          {activeFilters.map(([k, v]) => (
            <span key={k} style={{
              fontSize: 11, color: "#94a3b8",
              background: "#1e293b", padding: "2px 8px", borderRadius: 99,
            }}>{k}: {v}</span>
          ))}
        </div>
      )}

      {/* ── Entry list ───────────────────────────────────── */}
      {loading ? (
        <p style={{ textAlign: "center", padding: 64, color: "#475569", margin: 0 }}>
          Loading entries…
        </p>
      ) : entries.length === 0 ? (
        <p style={{ textAlign: "center", padding: 64, color: "#475569", margin: 0 }}>
          No entries match the current filters.
        </p>
      ) : (
        entries.map(e => <EntryCard key={e.id} entry={e} />)
      )}

      {/* ── Pagination ───────────────────────────────────── */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 16 }}>
          {[
            { label: "← Prev", disabled: page === 0,              onClick: () => setPage(p => Math.max(0, p - 1)) },
            { label: "Next →", disabled: page >= totalPages - 1,   onClick: () => setPage(p => Math.min(totalPages - 1, p + 1)) },
          ].map(btn => (
            <button
              key={btn.label}
              onClick={btn.onClick}
              disabled={btn.disabled}
              style={{
                padding: "6px 14px", fontSize: 13, borderRadius: 8,
                background: "#1e293b", border: "1px solid rgba(255,255,255,0.06)",
                color: btn.disabled ? "#334155" : "#94a3b8",
                cursor: btn.disabled ? "not-allowed" : "pointer",
              }}
            >{btn.label}</button>
          ))}
          <span style={{ fontSize: 13, color: "#475569" }}>{page + 1} / {totalPages}</span>
        </div>
      )}

      {/* ── Spinner keyframes ─────────────────────────────── */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
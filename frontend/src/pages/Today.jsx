import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import PageHeader from '../components/PageHeader'
import WarRoomContextBanner from '../components/WarRoomContextBanner'

// ── Helpers ───────────────────────────────────────────────────────────────────

function sevColor(sev) {
  if (!sev) return 'var(--text-muted)'
  if (sev >= 8) return '#ef4444'
  if (sev >= 6) return '#f97316'
  if (sev >= 4) return '#eab308'
  return '#22c55e'
}

function trendIcon(trend, invert = false) {
  if (trend === 'rising')  return { icon: '↑', color: invert ? '#22c55e' : '#ef4444' }
  if (trend === 'falling') return { icon: '↓', color: invert ? '#ef4444' : '#22c55e' }
  return { icon: '→', color: 'var(--text-muted)' }
}

function overallColor(overall) {
  if (overall === 'positive') return '#22c55e'
  if (overall === 'negative') return '#ef4444'
  return '#eab308'
}

function delta(a, b, invert = false) {
  if (a == null || b == null) return { symbol: '→', color: 'var(--text-muted)' }
  const diff = a - b
  if (Math.abs(diff) < 0.3 && typeof a === 'number') return { symbol: '→', color: 'var(--text-muted)' }
  const rising = diff > 0
  const good = invert ? !rising : rising
  if (rising) return { symbol: '↑', color: good ? '#22c55e' : '#ef4444' }
  return { symbol: '↓', color: good ? '#22c55e' : '#ef4444' }
}

function intDelta(a, b, invert = false) {
  if (a == null || b == null) return { symbol: '→', color: 'var(--text-muted)' }
  const diff = a - b
  if (diff === 0) return { symbol: '→', color: 'var(--text-muted)' }
  const rising = diff > 0
  const good = invert ? !rising : rising
  return { symbol: rising ? '↑' : '↓', color: good ? '#22c55e' : '#ef4444' }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ h = 100, w = '100%' }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: 12,
      background: 'linear-gradient(90deg, var(--bg-card) 25%, var(--border) 50%, var(--bg-card) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.6s infinite',
    }} />
  )
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({ label, value, color, sub }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '14px 18px', flex: '1 1 120px', minWidth: 110,
    }}>
      <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Syne', color: color || 'var(--text-primary)' }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'IBM Plex Mono' }}>{sub}</div>}
    </div>
  )
}

function ProgressBar({ pct, color }) {
  return (
    <div style={{ background: 'var(--border)', borderRadius: 4, height: 6, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color || 'var(--accent)', borderRadius: 4, transition: 'width 0.6s ease' }} />
    </div>
  )
}

// ── Brief card ────────────────────────────────────────────────────────────────

function BriefCard({ icon, label, content, accentColor, linkLabel, linkTo, reasoning }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const isEmpty = !content

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${isEmpty ? 'var(--border)' : accentColor ? accentColor + '33' : 'var(--border)'}`,
      borderRadius: 12,
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{
          fontSize: 10, fontFamily: 'IBM Plex Mono',
          color: accentColor || 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600,
        }}>{label}</span>
      </div>

      <p style={{
        fontSize: 14, lineHeight: 1.65,
        color: isEmpty ? 'var(--text-muted)' : 'var(--text-primary)',
        margin: 0, fontStyle: isEmpty ? 'italic' : 'normal',
      }}>
        {content || 'No data yet'}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
        {linkLabel && linkTo && !isEmpty && (
          <button
            onClick={() => navigate(linkTo)}
            style={{
              background: 'transparent',
              border: `1px solid ${accentColor || 'var(--border)'}`,
              borderRadius: 6, padding: '4px 12px',
              fontSize: 11, fontFamily: 'IBM Plex Mono',
              color: accentColor || 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {linkLabel} →
          </button>
        )}
        {reasoning && reasoning.length > 0 && (
          <button
            onClick={() => setOpen(v => !v)}
            style={{
              background: 'transparent', border: 'none',
              padding: '4px 0', fontSize: 11, fontFamily: 'IBM Plex Mono',
              color: 'var(--text-muted)', cursor: 'pointer',
              textDecoration: 'underline', textUnderlineOffset: 3,
            }}
          >
            {open ? 'hide signals ↑' : 'why am I seeing this? ↓'}
          </button>
        )}
      </div>

      {open && reasoning && (
        <div style={{
          background: 'var(--bg-base)', borderRadius: 8,
          padding: '12px 14px', marginTop: 2,
          borderLeft: `3px solid ${accentColor || 'var(--border)'}`,
        }}>
          <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Data signals</div>
          {reasoning.map((line, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: 'IBM Plex Mono' }}>
              · {line}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Trend Comparison Table ────────────────────────────────────────────────────

function TrendTable({ stats }) {
  if (!stats || !stats.avg_mood_7d) return null

  const rows = [
    {
      label:   'Mood score',
      recent:  stats.avg_mood_7d,
      prev:    stats.avg_mood_prev,
      format:  v => v != null ? v.toFixed(1) : '—',
      delta:   delta(stats.avg_mood_7d, stats.avg_mood_prev, true),
    },
    {
      label:   'Severity / stress',
      recent:  stats.avg_sev_7d,
      prev:    stats.avg_sev_prev,
      format:  v => v != null ? v.toFixed(1) : '—',
      delta:   delta(stats.avg_sev_7d, stats.avg_sev_prev, false),
    },
    {
      label:   'Conflict mentions',
      recent:  stats.conflict_recent,
      prev:    stats.conflict_older,
      format:  v => v != null ? String(v) : '—',
      delta:   intDelta(stats.conflict_recent, stats.conflict_older, false),
    },
    {
      label:   'Stress mentions',
      recent:  stats.stress_recent,
      prev:    stats.stress_older,
      format:  v => v != null ? String(v) : '—',
      delta:   intDelta(stats.stress_recent, stats.stress_older, false),
    },
    {
      label:   'Positive mentions',
      recent:  stats.positive_recent,
      prev:    stats.positive_older,
      format:  v => v != null ? String(v) : '—',
      delta:   intDelta(stats.positive_recent, stats.positive_older, true),
    },
  ]

  const cell = { padding: '10px 14px', fontSize: 13, fontFamily: 'IBM Plex Mono' }

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ fontSize: 13, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>7-day trend comparison</div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 60px', borderBottom: '1px solid var(--border)', background: 'var(--bg-base)' }}>
          {['Metric', 'Last 7 days', 'Prior 7 days', ''].map((h, i) => (
            <div key={i} style={{ ...cell, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</div>
          ))}
        </div>
        {rows.map((row, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 60px',
            borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ ...cell, color: 'var(--text-secondary)', fontSize: 12 }}>{row.label}</div>
            <div style={{ ...cell, color: 'var(--text-primary)', fontWeight: 600 }}>{row.format(row.recent)}</div>
            <div style={{ ...cell, color: 'var(--text-muted)' }}>{row.format(row.prev)}</div>
            <div style={{ ...cell, color: row.delta.color, fontWeight: 700, fontSize: 16 }}>{row.delta.symbol}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Where Should I Go Next? ───────────────────────────────────────────────────

function computeMode(stats, brief) {
  const sev        = stats.avg_sev_7d
  const conflict   = stats.conflict_trend
  const epPct      = stats.exit_plan_pct
  const epIdle     = stats.exit_plan_idle_days

  // Priority order
  if (sev != null && sev >= 7) {
    return {
      mode:  'Reflection Mode',
      why:   `Severity averaging ${sev}/10 this week — writing helps process high-stress periods`,
      label: 'Write',
      path:  '/write',
      color: '#ef4444',
      icon:  '✎',
    }
  }
  if (conflict === 'rising') {
    return {
      mode:  'Documentation Mode',
      why:   'Conflict keyword frequency is rising — this is the time to document patterns as evidence',
      label: 'Detective Mode',
      path:  '/detective',
      color: '#f97316',
      icon:  '◎',
    }
  }
  if (epPct != null && (epPct < 25 || (epIdle != null && epIdle > 14))) {
    const reason = epIdle > 14
      ? `Exit plan has been idle for ${epIdle} days`
      : `Exit plan is only ${epPct}% complete`
    return {
      mode:  'Planning Mode',
      why:   `${reason} — momentum matters here`,
      label: 'Exit Plan',
      path:  '/exit-plan',
      color: '#a78bfa',
      icon:  '◈',
    }
  }
  if (brief.most_important_decision) {
    return {
      mode:  'Decision Mode',
      why:   'Journal data shows an unresolved decision pattern that needs structured thinking',
      label: 'Help Me Choose',
      path:  '/decide',
      color: '#3b82f6',
      icon:  '⊘',
    }
  }
  return {
    mode:  'Analysis Mode',
    why:   'No urgent signal — best time to explore patterns and ask questions of your journal',
    label: 'Ask My Journal',
    path:  '/ask',
    color: '#22c55e',
    icon:  '◉',
  }
}

function WhereNext({ stats, brief }) {
  const navigate = useNavigate()
  if (!stats || !brief) return null

  const rec = computeMode(stats, brief)

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ fontSize: 13, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Where should I go next?</div>
      <div style={{
        background: 'var(--bg-card)',
        border: `1px solid ${rec.color}44`,
        borderRadius: 12, padding: '22px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18, color: rec.color }}>{rec.icon}</span>
            <span style={{ fontSize: 13, fontFamily: 'IBM Plex Mono', color: rec.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {rec.mode}
            </span>
          </div>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0, maxWidth: 520 }}>
            {rec.why}
          </p>
        </div>
        <button
          onClick={() => navigate(rec.path)}
          style={{
            background: rec.color, border: 'none',
            borderRadius: 8, padding: '10px 22px',
            fontSize: 13, fontFamily: 'IBM Plex Mono',
            color: '#000', fontWeight: 700, cursor: 'pointer',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          {rec.label} →
        </button>
      </div>
    </div>
  )
}

// ── Time Horizons section ─────────────────────────────────────────────────────

function TimeHorizons({ horizons }) {
  if (!horizons) return null
  const items = [
    { label: 'Today',      key: 'today',      color: '#22c55e', icon: '◈' },
    { label: 'This Week',  key: 'this_week',  color: '#3b82f6', icon: '◉' },
    { label: 'This Month', key: 'this_month', color: '#8b5cf6', icon: '◬' },
    { label: 'Long Term',  key: 'long_term',  color: '#f97316', icon: '◆' },
  ]
  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ fontSize: 13, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Planning horizon</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {items.map(({ label, key, color, icon }) => (
          <div key={key} style={{
            background: 'var(--bg-card)',
            border: `1px solid ${color}33`,
            borderRadius: 12, padding: '16px 18px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ color, fontSize: 14 }}>{icon}</span>
              <span style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: horizons[key] ? 'var(--text-primary)' : 'var(--text-muted)', margin: 0, fontStyle: horizons[key] ? 'normal' : 'italic' }}>
              {horizons[key] || 'No data yet'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Trajectory card ───────────────────────────────────────────────────────────

function TrajectoryCard({ trajectory }) {
  if (!trajectory) return null

  const dims = [
    { label: 'Mood',         key: 'mood',         invert: true  },
    { label: 'Stress',       key: 'stress',        invert: false },
    { label: 'Conflict',     key: 'conflict',      invert: false },
    { label: 'Independence', key: 'independence',  invert: true  },
  ]

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ fontSize: 13, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Trajectory</div>
      <div style={{
        background: 'var(--bg-card)',
        border: `1px solid ${overallColor(trajectory.overall)}33`,
        borderRadius: 12, padding: '22px 24px',
      }}>
        {/* Overall label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Overall direction</span>
          <span style={{ fontSize: 13, fontFamily: 'IBM Plex Mono', fontWeight: 700, color: overallColor(trajectory.overall), textTransform: 'uppercase' }}>
            {trajectory.overall}
          </span>
        </div>

        {/* Dimension arrows */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          {dims.map(({ label, key, invert }) => {
            const t = trendIcon(trajectory[key], invert)
            return (
              <div key={key} style={{
                background: 'var(--bg-base)', borderRadius: 8,
                padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 80,
              }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'IBM Plex Mono' }}>{label}</span>
                <span style={{ fontSize: 16, color: t.color, fontWeight: 700 }}>{t.icon}</span>
              </div>
            )
          })}
        </div>

        {/* Summary */}
        {trajectory.summary && (
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>
            {trajectory.summary}
          </p>
        )}

        {/* Changes if */}
        {trajectory.changes_if && trajectory.changes_if.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>This trajectory changes if</div>
            {trajectory.changes_if.map((item, i) => (
              <div key={i} style={{
                fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
                padding: '6px 0', borderBottom: i < trajectory.changes_if.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <span style={{ color: '#22c55e', marginRight: 8 }}>→</span>{item}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Today() {
  const [data, setData]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]           = useState(null)

  const load = useCallback(async (force = false) => {
    try {
      force ? setRefreshing(true) : setLoading(true)
      const res = force
        ? await api.post('/api/today/refresh')
        : await api.get('/api/today')
      setData(res.data)
      setError(null)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load daily brief.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const brief     = data?.brief    || {}
  const stats     = data?.stats    || {}
  const reasoning = data?.reasoning || {}
  const noData    = data?.no_data

  const moodT     = trendIcon(stats.mood_trend,     true)
  const stressT   = trendIcon(stats.stress_trend,   false)
  const conflictT = trendIcon(stats.conflict_trend, false)
  const epPct     = stats.exit_plan_pct

  // Card order: State → Risk → Decision → Action → Direction
  // All cards now have routing links
  const cards = [
    { icon: '◉', label: 'Emotional state',           key: 'emotional_state',        accentColor: '#8b5cf6', linkLabel: 'Patterns',       linkTo: '/patterns'    },
    { icon: '↑', label: "What's getting worse",      key: 'getting_worse',           accentColor: '#ef4444', linkLabel: 'Timeline',       linkTo: '/timeline'    },
    { icon: '↓', label: "What's getting better",     key: 'getting_better',          accentColor: '#22c55e', linkLabel: 'Timeline',       linkTo: '/timeline'    },
    { icon: '⚠', label: 'Biggest risk right now',    key: 'biggest_risk',            accentColor: '#ef4444', linkLabel: 'War Room',       linkTo: '/war-room'    },
    { icon: '⊘', label: 'Most important decision',   key: 'most_important_decision', accentColor: '#3b82f6', linkLabel: 'Help Me Choose', linkTo: '/decide'      },
    { icon: '◷', label: "What you're avoiding",      key: 'avoiding',                accentColor: '#f97316', linkLabel: 'Ask My Journal', linkTo: '/ask'         },
    { icon: '✓', label: 'One thing to do today',     key: 'do_today',                accentColor: '#22c55e', linkLabel: 'Write',          linkTo: '/write'       },
    { icon: '✕', label: 'One thing to stop doing',   key: 'stop_doing',              accentColor: '#f97316', linkLabel: 'Patterns',       linkTo: '/patterns'    },
    { icon: '◈', label: 'Progress toward independence', key: 'independence_note',    accentColor: '#a78bfa', linkLabel: 'Exit Plan',      linkTo: '/exit-plan'   },
  ]

  return (
    <div>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

      <PageHeader
        title="Today"
        subtitle="Your daily intelligence brief"
        actions={
          <button
            onClick={() => load(true)}
            disabled={refreshing || loading}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '6px 14px',
              fontSize: 11, fontFamily: 'IBM Plex Mono',
              color: refreshing ? 'var(--text-muted)' : 'var(--text-secondary)',
              cursor: refreshing ? 'default' : 'pointer',
            }}
          >
            {refreshing ? 'regenerating…' : '↻ refresh'}
          </button>
        }
      />

      <WarRoomContextBanner />

      {error && (
        <div style={{ background: '#ef444422', border: '1px solid #ef4444', borderRadius: 10, padding: '14px 18px', marginBottom: 24, fontSize: 13, color: '#ef4444' }}>
          {error}
        </div>
      )}

      {noData && !loading && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>✎</div>
          <p style={{ fontSize: 15, color: 'var(--text-primary)', marginBottom: 8 }}>No entries yet</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Start journaling to get your daily brief.</p>
        </div>
      )}

      {!noData && (
        <>
          {/* ── Stats row ─────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={80} w={120} />)
            ) : (
              <>
                <StatChip label="Mood 7d"     value={stats.avg_mood_7d ?? '—'} color="#22c55e"              sub={`trend ${moodT.icon}`} />
                <StatChip label="Severity 7d" value={stats.avg_sev_7d ?? '—'} color={sevColor(stats.avg_sev_7d)} sub={`stress ${stressT.icon}`} />
                <StatChip label="Conflict"    value={stats.conflict_trend || '—'} color={conflictT.color}   sub="keyword trend" />
                <StatChip label="Entries"     value={stats.total_entries_30d ?? '—'} color="var(--accent)" sub="last 30 days" />
                {epPct !== null && epPct !== undefined && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', flex: '1 1 150px', minWidth: 140 }}>
                    <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Exit plan</div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Syne', color: '#a78bfa' }}>{epPct}%</div>
                    <ProgressBar pct={epPct} color="#a78bfa" />
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Brief cards ───────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {loading
              ? Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} h={120} />)
              : cards.map(({ icon, label, key, accentColor, linkLabel, linkTo }) => (
                  <BriefCard
                    key={key}
                    icon={icon}
                    label={label}
                    content={brief[key]}
                    accentColor={accentColor}
                    linkLabel={linkLabel}
                    linkTo={linkTo}
                    reasoning={reasoning[key]}
                  />
                ))
            }
          </div>

          {/* ── Trend Comparison ──────────────────────────────────────────── */}
          {loading
            ? <Skeleton h={200} w="100%" />
            : <TrendTable stats={stats} />
          }

          {/* ── Time Horizons ──────────────────────────────────────────────── */}
          {loading
            ? <Skeleton h={160} w="100%" />
            : <TimeHorizons horizons={brief.time_horizons} />
          }

          {/* ── Trajectory ────────────────────────────────────────────────── */}
          {loading
            ? <Skeleton h={200} w="100%" />
            : <TrajectoryCard trajectory={brief.trajectory} />
          }

          {/* ── Where Should I Go Next? ────────────────────────────────────── */}
          {loading
            ? <Skeleton h={100} w="100%" />
            : <WhereNext stats={stats} brief={brief} />
          }

          {/* ── Footer ───────────────────────────────────────────────────── */}
          {!loading && data?.cached && (
            <p style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', marginTop: 20, textAlign: 'center' }}>
              served from cache · hit refresh to regenerate
            </p>
          )}
        </>
      )}
    </div>
  )
}

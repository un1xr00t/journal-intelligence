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
  // invert=true means rising is good (mood), invert=false means rising is bad (stress/conflict)
  if (trend === 'rising')  return { icon: '↑', color: invert ? '#22c55e' : '#ef4444' }
  if (trend === 'falling') return { icon: '↓', color: invert ? '#ef4444' : '#22c55e' }
  return { icon: '→', color: 'var(--text-muted)' }
}

function overallColor(overall) {
  if (overall === 'positive') return '#22c55e'
  if (overall === 'negative') return '#ef4444'
  return '#eab308'
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

// ── Brief card with "Why AI thinks this" ─────────────────────────────────────

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
    { label: 'Mood',         key: 'mood',          invert: true  },
    { label: 'Stress',       key: 'stress',         invert: false },
    { label: 'Conflict',     key: 'conflict',       invert: false },
    { label: 'Independence', key: 'independence',   invert: true  },
  ]

  const overall   = trajectory.overall || 'neutral'
  const oColor    = overallColor(overall)

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ fontSize: 13, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>If nothing changes</div>
      <div style={{
        background: 'var(--bg-card)',
        border: `1px solid ${oColor}44`,
        borderRadius: 12, padding: '20px 24px',
      }}>
        {/* Overall badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <span style={{
            fontSize: 11, fontFamily: 'IBM Plex Mono', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.1em',
            color: oColor, background: oColor + '22',
            padding: '4px 12px', borderRadius: 20, border: `1px solid ${oColor}44`,
          }}>
            Overall trajectory: {overall}
          </span>
        </div>

        {/* Dimension grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
          {dims.map(({ label, key, invert }) => {
            const t = trajectory[key] || 'stable'
            const { icon, color } = trendIcon(t, invert)
            return (
              <div key={key} style={{
                background: 'var(--bg-base)', borderRadius: 8, padding: '10px 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'IBM Plex Mono' }}>{label}</span>
                <span style={{ fontSize: 16, color, fontWeight: 700 }}>{icon}</span>
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
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]         = useState(null)

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

  const brief      = data?.brief   || {}
  const stats      = data?.stats   || {}
  const reasoning  = data?.reasoning || {}
  const noData     = data?.no_data

  const moodT     = trendIcon(stats.mood_trend,     true)
  const stressT   = trendIcon(stats.stress_trend,   false)
  const conflictT = trendIcon(stats.conflict_trend, false)
  const epPct     = stats.exit_plan_pct

  // Card order per spec: State → Risk → Decision → Action → Direction
  const cards = [
    { icon: '◉', label: 'Emotional state',          key: 'emotional_state',       accentColor: '#8b5cf6' },
    { icon: '↑', label: "What's getting worse",     key: 'getting_worse',          accentColor: '#ef4444' },
    { icon: '↓', label: "What's getting better",    key: 'getting_better',         accentColor: '#22c55e' },
    { icon: '⚠', label: 'Biggest risk right now',   key: 'biggest_risk',           accentColor: '#ef4444', linkLabel: 'War Room',       linkTo: '/war-room'    },
    { icon: '⊘', label: 'Most important decision',  key: 'most_important_decision',accentColor: '#3b82f6', linkLabel: 'Help Me Choose', linkTo: '/decide'      },
    { icon: '◷', label: "What you're avoiding",     key: 'avoiding',               accentColor: '#f97316', linkLabel: 'Ask My Journal', linkTo: '/ask'         },
    { icon: '✓', label: 'One thing to do today',    key: 'do_today',               accentColor: '#22c55e', linkLabel: 'Write',          linkTo: '/write'       },
    { icon: '✕', label: 'One thing to stop doing',  key: 'stop_doing',             accentColor: '#f97316' },
    { icon: '◈', label: 'Progress toward independence', key: 'independence_note',  accentColor: '#a78bfa', linkLabel: 'Exit Plan',      linkTo: '/exit-plan'   },
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
                <StatChip label="Mood 7d"   value={stats.avg_mood_7d ?? '—'} color="#22c55e"              sub={`trend ${moodT.icon}`} />
                <StatChip label="Severity 7d" value={stats.avg_sev_7d ?? '—'} color={sevColor(stats.avg_sev_7d)} sub={`stress ${stressT.icon}`} />
                <StatChip label="Conflict"  value={stats.conflict_trend || '—'} color={conflictT.color}   sub="keyword trend" />
                <StatChip label="Entries"   value={stats.total_entries_30d ?? '—'} color="var(--accent)" sub="last 30 days" />
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

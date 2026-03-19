import { useState, useEffect } from 'react'
import api from '../services/api'

// ── Small helpers ─────────────────────────────────────────────────────────────

function Chip({ label, color = '#6366f1', bg }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 500,
      fontFamily: 'IBM Plex Mono, monospace',
      background: bg || 'rgba(99,102,241,0.12)',
      color: color,
      border: `1px solid ${color}30`,
      marginRight: 6,
      marginBottom: 6,
    }}>{label}</span>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 9,
      fontFamily: 'IBM Plex Mono, monospace',
      letterSpacing: '0.12em',
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      marginBottom: 12,
    }}>— {children} —</div>
  )
}

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '20px 24px',
      marginBottom: 20,
      ...style,
    }}>
      {children}
    </div>
  )
}

const TREND_LABELS = {
  declining: { label: 'Declining', color: '#f97316' },
  stable:    { label: 'Stable',    color: '#6366f1' },
  rising:    { label: 'Rising',    color: '#10b981' },
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EarlyWarning() {
  const [status,    setStatus]    = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [rebuilding,setRebuilding]= useState(false)
  const [error,     setError]     = useState(null)

  const load = () => {
    setLoading(true)
    setError(null)
    api.get('/api/early-warning/status')
      .then(r => { setStatus(r.data); setLoading(false) })
      .catch(e => { setError('Could not load warning status.'); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const dismiss = () => {
    api.post('/api/early-warning/dismiss')
      .then(() => load())
      .catch(() => {})
  }

  const rebuild = () => {
    setRebuilding(true)
    api.post('/api/early-warning/rebuild')
      .then(() => load())
      .catch(() => setRebuilding(false))
      .finally(() => setRebuilding(false))
  }

  const sig = status?.current_signals || {}
  const trend = TREND_LABELS[sig.trend] || TREND_LABELS.stable

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{
          fontFamily: 'Syne, sans-serif', fontWeight: 800,
          fontSize: 22, color: 'var(--text-primary)', marginBottom: 6,
        }}>
          Early Warning
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Pattern matching against your own history. Not a prediction — a signal.
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace' }}>
          Scanning patterns...
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <Card style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
          <div style={{ fontSize: 13, color: '#f87171' }}>{error}</div>
          <button onClick={load} style={{ marginTop: 12, fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Retry</button>
        </Card>
      )}

      {/* ── Status card ── */}
      {!loading && status && (
        <>
          <Card style={{
            borderColor: status.active
              ? 'rgba(245,158,11,0.4)'
              : status.dismissed
              ? 'rgba(99,102,241,0.25)'
              : 'var(--border)',
            background: status.active
              ? 'linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(249,115,22,0.04) 100%)'
              : undefined,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: status.active
                  ? 'rgba(245,158,11,0.15)'
                  : 'rgba(99,102,241,0.10)',
                fontSize: 16,
              }}>
                {status.active ? '◬' : status.dismissed ? '○' : '◎'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15,
                  color: status.active ? '#f59e0b' : 'var(--text-primary)',
                  marginBottom: 4,
                }}>
                  {status.active
                    ? 'Familiar patterns detected'
                    : status.dismissed
                    ? 'Warning dismissed'
                    : status.total_patterns === 0
                    ? 'No historical patterns yet'
                    : status.reason === 'insufficient_data'
                    ? 'Not enough data yet'
                    : 'No matching patterns right now'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {status.active && (
                    <>
                      Your last 3 days match signals from{' '}
                      <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                        {status.matched_count} past {status.matched_count === 1 ? 'period' : 'periods'}
                      </strong>{' '}
                      that led to high-severity days.
                      {status.last_spike_date && (
                        <> Most recent comparable spike: {status.last_spike_date} (severity {status.last_spike_severity?.toFixed(1)}).</>
                      )}
                    </>
                  )}
                  {!status.active && status.total_patterns > 0 && !status.dismissed && (
                    <>
                      {status.total_patterns} historical pattern{status.total_patterns !== 1 ? 's' : ''} on file.
                      Current signals don't match the threshold for a warning.
                    </>
                  )}
                  {status.total_patterns === 0 && (
                    <>Not enough historical data to detect patterns. More entries needed.</>
                  )}
                  {status.dismissed && (
                    <>Warning was dismissed. It will resurface after 24 hours if still active.</>
                  )}
                </div>

                {/* Stats row */}
                {status.total_patterns > 0 && (
                  <div style={{ display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Patterns on file',   value: status.total_patterns },
                      { label: 'Current matches',    value: status.matched_count ?? 0 },
                      { label: 'Signal confidence',  value: status.confidence ? `${Math.round(status.confidence * 100)}%` : '—' },
                      { label: 'Avg severity (3d)',  value: sig.avg_severity != null ? sig.avg_severity : '—' },
                    ].map(s => (
                      <div key={s.label}>
                        <div style={{ fontSize: 9, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>{s.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Syne, sans-serif', color: 'var(--text-primary)' }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            {status.active && (
              <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                <button onClick={dismiss} style={{
                  padding: '7px 16px', background: 'rgba(245,158,11,0.12)',
                  border: '1px solid rgba(245,158,11,0.35)', borderRadius: 6,
                  color: '#fcd34d', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  This time is different
                </button>
              </div>
            )}
          </Card>

          {/* ── Current Signals ── */}
          {(sig.topics?.length > 0 || sig.people?.length > 0 || sig.keywords?.length > 0) && (
            <Card>
              <SectionLabel>Current signals — last 3 days</SectionLabel>

              {sig.trend && (
                <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Mood trend</span>
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    background: trend.color + '20', color: trend.color,
                    border: `1px solid ${trend.color}40`,
                  }}>{trend.label}</span>
                  {sig.sev_trending_up && (
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: 'rgba(249,115,22,0.12)', color: '#f97316',
                      border: '1px solid rgba(249,115,22,0.30)',
                    }}>Severity climbing</span>
                  )}
                </div>
              )}

              {sig.people?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>People appearing</div>
                  <div>
                    {sig.people.map(p => (
                      <Chip key={p} label={p} color='#a78bfa' bg='rgba(167,139,250,0.10)' />
                    ))}
                  </div>
                </div>
              )}

              {sig.topics?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Topics active</div>
                  <div>
                    {sig.topics.map(t => (
                      <Chip key={t} label={t} color='#6366f1' bg='rgba(99,102,241,0.10)' />
                    ))}
                  </div>
                </div>
              )}

              {sig.keywords?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Stress language detected</div>
                  <div>
                    {sig.keywords.map(k => (
                      <Chip key={k} label={k} color='#f97316' bg='rgba(249,115,22,0.10)' />
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* ── Historical Matches ── */}
          {status.matched_spikes?.length > 0 && (
            <Card>
              <SectionLabel>Matched historical spikes</SectionLabel>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                These are past periods that look similar to your last 3 days.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {status.matched_spikes.map((m, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '10px 14px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: `rgba(239,68,68,${Math.min(0.3, m.spike_severity / 30)})`,
                      border: '1px solid rgba(239,68,68,0.35)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, color: '#f87171', fontFamily: 'IBM Plex Mono, monospace',
                    }}>
                      {m.spike_severity?.toFixed(0)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{m.spike_date}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Severity {m.spike_severity?.toFixed(1)}</div>
                    </div>
                    <div style={{
                      fontSize: 11, fontWeight: 600, fontFamily: 'IBM Plex Mono, monospace',
                      color: m.score >= 60 ? '#f97316' : '#f59e0b',
                      background: m.score >= 60 ? 'rgba(249,115,22,0.10)' : 'rgba(245,158,11,0.10)',
                      padding: '3px 10px', borderRadius: 20,
                      border: `1px solid ${m.score >= 60 ? 'rgba(249,115,22,0.30)' : 'rgba(245,158,11,0.25)'}`,
                    }}>
                      {m.score}% match
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ── Empty state / no patterns yet ── */}
          {status.total_patterns === 0 && !loading && (
            <Card style={{ textAlign: 'center', padding: '36px 24px' }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>◬</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>No patterns built yet</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 20 }}>
                The system needs enough entries with varying severity to detect pre-spike patterns.
                As your journal grows, patterns will emerge automatically.
              </div>
            </Card>
          )}

          {/* ── Rebuild / info ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Patterns rebuild automatically when you first visit.{' '}
              {status.total_patterns > 0 && (
                <>{status.total_patterns} historical pattern{status.total_patterns !== 1 ? 's' : ''} on file.</>
              )}
            </div>
            <button
              onClick={rebuild}
              disabled={rebuilding}
              style={{
                padding: '7px 16px', background: 'rgba(99,102,241,0.10)',
                border: '1px solid rgba(99,102,241,0.25)', borderRadius: 6,
                color: rebuilding ? 'var(--text-muted)' : 'var(--accent)',
                fontSize: 12, cursor: rebuilding ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}>
              {rebuilding ? 'Rebuilding...' : '↺ Rebuild patterns'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import api from '../services/api'
import PageHeader from '../components/PageHeader'
import StatsRow from '../components/StatsRow'
import { useAuth } from '../contexts/AuthContext'

const PRIORITY_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#6366f1' }
function priorityTier(score) { return score >= 8 ? 'high' : score >= 6 ? 'medium' : 'low' }

function AlertCard({ alert, onAnalyze, onAck, onReload, isOwner }) {
  const [expanded, setExpanded] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [acking, setAcking] = useState(false)
  const [analyzeError, setAnalyzeError] = useState(null)
  const tier = priorityTier(alert.priority_score)
  const color = PRIORITY_COLORS[tier]

  const handleAnalyze = async () => {
    setAnalyzing(true)
    setAnalyzeError(null)
    setExpanded(true)
    try {
      await onAnalyze(alert.id)
      // Backend queues it as a background task — poll until ai_analysis appears
      let attempts = 0
      const maxAttempts = 30 // 30 × 2s = 60s timeout
      const poll = setInterval(async () => {
        attempts++
        try {
          const res = await api.get('/api/patterns/alerts')
          const alerts = res.data.alerts || []
          const updated = alerts.find(a => a.id === alert.id)
          if (updated?.ai_analysis) {
            clearInterval(poll)
            setAnalyzing(false)
            onReload()
          } else if (attempts >= maxAttempts) {
            clearInterval(poll)
            setAnalyzing(false)
            setAnalyzeError('Timed out — analysis may still be running, try refreshing')
          }
        } catch {
          clearInterval(poll)
          setAnalyzing(false)
          setAnalyzeError('Lost connection while waiting for analysis')
        }
      }, 2000)
    } catch (e) {
      setAnalyzing(false)
      setAnalyzeError('Analysis failed — check logs')
    }
  }

  const handleAck = async () => {
    setAcking(true)
    try { await onAck(alert.id) } catch (e) { /* silent */ }
    setAcking(false)
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${color}30`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 10,
      padding: '16px 20px',
      marginBottom: 10,
      transition: 'border-color 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, fontFamily: 'IBM Plex Mono', padding: '2px 7px',
              borderRadius: 20, background: `${color}20`, color,
              border: `1px solid ${color}40`, textTransform: 'uppercase',
            }}>{tier}</span>
            <span style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)' }}>
              {alert.date_range_start} → {alert.date_range_end || 'ongoing'}
            </span>
            <span style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              score: {alert.priority_score?.toFixed(1)}
            </span>
          </div>

          <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, marginBottom: 4 }}>
            {alert.alert_type?.replace(/_/g, ' ')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {alert.description}
          </div>

          {/* Expanded area */}
          {expanded && (
            <div style={{ marginTop: 12 }}>
              {analyzing ? (
                <div style={{
                  padding: '12px 14px',
                  background: 'rgba(99,102,241,0.06)',
                  border: '1px solid rgba(99,102,241,0.15)',
                  borderRadius: 8,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--accent)', animation: 'pulse 1.5s infinite' }}>
                    ◌ Running AI analysis on {alert.date_range_start} → {alert.date_range_end}...
                  </span>
                </div>
              ) : alert.ai_analysis ? (
                <div style={{
                  padding: '12px 14px',
                  background: 'rgba(99,102,241,0.06)',
                  border: '1px solid rgba(99,102,241,0.15)',
                  borderRadius: 8,
                }}>
                  <div style={{
                    fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--accent)',
                    marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em',
                  }}>AI Analysis</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {alert.ai_analysis}
                  </div>
                </div>
              ) : analyzeError ? (
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 8,
                  fontSize: 12, fontFamily: 'IBM Plex Mono', color: '#ef4444',
                }}>
                  ✕ {analyzeError}
                </div>
              ) : (
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px dashed var(--border)',
                  borderRadius: 8,
                  fontSize: 12, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono',
                }}>
                  No AI analysis yet.{isOwner ? ' Click Analyze to generate.' : ' Owner can trigger analysis.'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => setExpanded(x => !x)}
            style={{
              padding: '5px 10px',
              background: expanded ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)', borderRadius: 6,
              color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer',
            }}>
            {expanded ? 'Collapse' : 'Expand'}
          </button>

          {isOwner && !alert.ai_analysis && (
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              style={{
                padding: '5px 10px',
                background: analyzing ? 'rgba(99,102,241,0.05)' : 'rgba(99,102,241,0.1)',
                border: '1px solid var(--border-bright)', borderRadius: 6,
                color: analyzing ? 'var(--text-muted)' : 'var(--accent)',
                fontSize: 11, cursor: analyzing ? 'not-allowed' : 'pointer',
                fontFamily: 'IBM Plex Mono',
              }}>
              {analyzing ? '...' : 'Analyze'}
            </button>
          )}

          {isOwner && alert.ai_analysis && (
            <div style={{
              padding: '3px 8px', fontSize: 10, fontFamily: 'IBM Plex Mono',
              color: '#8b5cf6', textAlign: 'center',
            }}>✓ analyzed</div>
          )}

          {isOwner && (
            <button
              onClick={handleAck}
              disabled={acking}
              style={{
                padding: '5px 10px',
                background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6,
                color: acking ? 'var(--text-muted)' : '#10b981',
                fontSize: 11, cursor: acking ? 'not-allowed' : 'pointer',
              }}>
              {acking ? '...' : 'Ack'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Patterns() {
  const [alerts, setAlerts] = useState([])
  const [rollups, setRollups] = useState([])
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const isOwner = user?.role === 'owner'

  const load = async () => {
    setLoading(true)
    try {
      const [alertsRes, rollupsRes] = await Promise.all([
        api.get('/api/patterns/alerts'),
        api.get('/api/rollups'),
      ])
      setAlerts(alertsRes.data.alerts || [])
      setRollups(rollupsRes.data.rollups || [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const runDetection = async () => {
    setRunning(true)
    setRunResult(null)
    try {
      const res = await api.post('/api/patterns/run')
      setRunResult(`Detection complete — ${res.data?.new_alerts ?? '?'} new alerts`)
      await load()
    } catch (e) {
      setRunResult('Detection failed — check logs')
    }
    setRunning(false)
    setTimeout(() => setRunResult(null), 5000)
  }

  const analyzeAlert = async (id) => {
    await api.post(`/api/patterns/alerts/${id}/analyze`)
    // don't reload here — AlertCard polls for completion
  }

  const ackAlert = async (id) => {
    await api.post(`/api/patterns/alerts/${id}/acknowledge`)
    await load()
  }

  const active = alerts.filter(a => !a.acknowledged)
  const critical = active.filter(a => a.priority_score >= 8)
  const withAI = active.filter(a => a.ai_analysis)

  return (
    <div>
      <PageHeader
        title="Patterns"
        subtitle="Rule-based detection + AI analysis"
        actions={isOwner && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <button
              onClick={runDetection}
              disabled={running}
              style={{
                padding: '7px 14px',
                background: running
                  ? 'rgba(99,102,241,0.2)'
                  : 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                border: 'none', borderRadius: 7, color: '#fff',
                fontSize: 12, cursor: running ? 'not-allowed' : 'pointer',
                fontFamily: 'Syne', fontWeight: 600,
              }}>
              {running ? '◌ Running...' : '⬡ Run Detection'}
            </button>
            {runResult && (
              <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)' }}>
                {runResult}
              </span>
            )}
          </div>
        )}
      />

      <StatsRow stats={[
        { label: 'Active Alerts', value: active.length, color: 'var(--accent)' },
        { label: 'Critical', value: critical.length, color: '#ef4444' },
        { label: 'AI Analyzed', value: withAI.length, color: '#8b5cf6' },
        { label: 'Weekly Rollups', value: rollups.length, color: '#10b981' },
      ]} />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono', fontSize: 12 }}>
          loading patterns...
        </div>
      ) : active.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono', fontSize: 12 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
          no active alerts
        </div>
      ) : (
        <>
          {critical.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                Critical
              </div>
              {critical.map(a => (
                <AlertCard key={a.id} alert={a} onAnalyze={analyzeAlert} onAck={ackAlert} onReload={load} isOwner={isOwner} />
              ))}
            </>
          )}

          {active.filter(a => a.priority_score < 8).length > 0 && (
            <>
              <div style={{
                fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.1em',
                marginBottom: 8, marginTop: critical.length > 0 ? 20 : 0,
              }}>
                Active
              </div>
              {active.filter(a => a.priority_score < 8).map(a => (
                <AlertCard key={a.id} alert={a} onAnalyze={analyzeAlert} onAck={ackAlert} onReload={load} isOwner={isOwner} />
              ))}
            </>
          )}
        </>
      )}

      {rollups.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Weekly Rollups
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {rollups.slice(0, 8).map((r, i) => (
              <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--accent)', marginBottom: 4 }}>
                  {r.period_label || r.week_start}
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>entries</div>
                    <div style={{ fontSize: 16, fontFamily: 'Syne', fontWeight: 700 }}>{r.entry_count}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>avg mood</div>
                    <div style={{ fontSize: 16, fontFamily: 'Syne', fontWeight: 700, color: '#10b981' }}>
                      {parseFloat(r.avg_mood_score || 0).toFixed(1)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>avg sev</div>
                    <div style={{ fontSize: 16, fontFamily: 'Syne', fontWeight: 700, color: 'var(--severity-color)' }}>
                      {parseFloat(r.avg_severity || 0).toFixed(1)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

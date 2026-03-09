import { useState, useEffect, useRef } from 'react'
import api from '../services/api'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../contexts/AuthContext'

const pulseStyle = `
@keyframes jd-pulse-ring {
  0%   { transform: scale(0.8); opacity: 0.8; }
  50%  { transform: scale(1.15); opacity: 0.3; }
  100% { transform: scale(0.8); opacity: 0.8; }
}
@keyframes jd-spin {
  to { transform: rotate(360deg); }
}
@keyframes jd-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes jd-dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40%           { transform: translateY(-6px); opacity: 1; }
}
`

function AnalyzingModal({ visible, onClose }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!visible) { setElapsed(0); return }
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [visible])

  if (!visible) return null

  const msgs = [
    "Reading both journal entries…",
    "Comparing statements across time…",
    "Looking for genuine conflict…",
    "Weighing context and intent…",
    "Writing analysis…",
  ]
  const msgIdx = Math.min(Math.floor(elapsed / 8), msgs.length - 1)

  return (
    <>
      <style>{pulseStyle}</style>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-bright)',
          borderRadius: 16, padding: '40px 48px', minWidth: 320, maxWidth: 400,
          textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          animation: 'jd-fade-in 0.25s ease',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, var(--accent), rgba(99,102,241,0.3), var(--accent))', borderRadius: '16px 16px 0 0' }} />

          {/* Close button */}
          <button onClick={onClose} style={{
            position: 'absolute', top: 14, right: 14,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 18, lineHeight: 1,
            padding: '4px 8px', borderRadius: 6,
            opacity: 0.6, transition: 'opacity 0.15s',
          }}
            onMouseEnter={e => e.target.style.opacity = 1}
            onMouseLeave={e => e.target.style.opacity = 0.6}
            title="Cancel"
          >✕</button>

          {/* Pulsing orb */}
          <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 24px' }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'rgba(99,102,241,0.15)',
              animation: 'jd-pulse-ring 2s ease-in-out infinite',
            }} />
            <div style={{
              position: 'absolute', inset: 8, borderRadius: '50%',
              border: '2px solid var(--accent)', borderTopColor: 'transparent',
              animation: 'jd-spin 1s linear infinite',
            }} />
            <div style={{ position: 'absolute', inset: 16, borderRadius: '50%', background: 'var(--accent)', opacity: 0.15 }} />
          </div>

          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.01em' }}>
            Analyzing Contradiction
          </div>

          <div key={msgIdx} style={{
            fontSize: 12, color: 'var(--text-muted)', marginBottom: 24,
            animation: 'jd-fade-in 0.4s ease', fontFamily: 'IBM Plex Mono', minHeight: 18,
          }}>
            {msgs[msgIdx]}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 24 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)',
                animation: `jd-dot-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>

          <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', opacity: 0.6 }}>
            {elapsed}s elapsed · typically 20–40s
          </div>
        </div>
      </div>
    </>
  )
}

function ContradictionCard({ item, onAnalyze, onDismiss, isOwner, analyzing }) {
  const [expanded, setExpanded] = useState(false)
  const high = item.priority_score >= 7
  const isPending = analyzing === item.id
  const hasAnalysis = !!item.ai_analysis

  // Auto-expand when analysis arrives
  const prevAnalysis = useRef(item.ai_analysis)
  useEffect(() => {
    if (!prevAnalysis.current && item.ai_analysis) setExpanded(true)
    prevAnalysis.current = item.ai_analysis
  }, [item.ai_analysis])

  // Parse ai_analysis once
  let parsed = null
  let parseError = false
  if (hasAnalysis) {
    try { parsed = JSON.parse(item.ai_analysis) } catch { parseError = true }
  }
  const isErrorResult = parseError || !!parsed?.error

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 10, padding: '16px 20px', marginBottom: 10,
      border: `1px solid ${high ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
      borderLeft: `3px solid ${high ? '#ef4444' : 'var(--accent)'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: high ? '#ef4444' : 'var(--accent)' }}>score: {item.priority_score?.toFixed(1)}</span>
            <span style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)' }}>{item.date_a} ↔ {item.date_b}</span>
          </div>
          {item.description && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>{item.description}</p>}

          {/* Statements */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ padding: '10px 12px', background: 'rgba(99,102,241,0.06)', borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--accent)', marginBottom: 4 }}>{item.date_a}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic' }}>
                "{item.statement_a || 'No statement'}"
              </div>
            </div>
            <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.06)', borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: '#ef4444', marginBottom: 4 }}>{item.date_b}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic' }}>
                "{item.statement_b || 'No statement'}"
              </div>
            </div>
          </div>

          {/* AI Analysis — shown inline when expanded */}
          {expanded && hasAnalysis && (() => {
            if (isErrorResult) {
              return (
                <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: '#ef4444', marginBottom: 4 }}>ANALYSIS ERROR</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{parsed?.error || 'Could not parse AI response.'}</div>
                </div>
              )
            }

            const severityColor = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444', critical: '#dc2626' }[parsed?.severity_assessment] || 'var(--accent)'

            return (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Main analysis */}
                {parsed?.analysis && (
                  <div style={{ padding: '12px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>AI Analysis</div>
                      {parsed?.severity_assessment && (
                        <span style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: severityColor, padding: '2px 6px', border: `1px solid ${severityColor}`, borderRadius: 4, opacity: 0.85 }}>
                          {parsed.severity_assessment}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{parsed.analysis}</div>
                  </div>
                )}

                {/* Evidence points */}
                {parsed?.evidence?.length > 0 && (
                  <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Evidence</div>
                    {parsed.evidence.map((pt, idx) => (
                      <div key={idx} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, paddingLeft: 10, borderLeft: '2px solid var(--border)', marginBottom: 4 }}>
                        {pt}
                      </div>
                    ))}
                  </div>
                )}

                {/* Recommended actions */}
                {parsed?.recommended_actions?.length > 0 && (
                  <div style={{ padding: '10px 14px', background: 'rgba(99,102,241,0.04)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Suggested Actions</div>
                    {parsed.recommended_actions.map((action, idx) => (
                      <div key={idx} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, paddingLeft: 10, borderLeft: '2px solid rgba(99,102,241,0.3)', marginBottom: 4 }}>
                        {action}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          {/* View Analysis — only when analysis succeeded */}
          {hasAnalysis && !isErrorResult && (
            <button onClick={() => setExpanded(x => !x)} style={{ padding: '5px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>
              {expanded ? 'Collapse' : 'View Analysis'}
            </button>
          )}
          {/* Retry — only when analysis failed */}
          {isOwner && isErrorResult && (
            <button onClick={() => onAnalyze(item.id, true)} style={{ padding: '5px 10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#ef4444', fontSize: 11, cursor: 'pointer' }}>
              Retry
            </button>
          )}
          {/* Analyze — only when no analysis at all */}
          {isOwner && !hasAnalysis && !isPending && (
            <button onClick={() => onAnalyze(item.id, false)} style={{ padding: '5px 10px', background: 'rgba(99,102,241,0.1)', border: '1px solid var(--border-bright)', borderRadius: 6, color: 'var(--accent)', fontSize: 11, cursor: 'pointer' }}>
              Analyze
            </button>
          )}
          {isPending && (
            <button disabled style={{ padding: '5px 10px', background: 'rgba(99,102,241,0.05)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 11, cursor: 'not-allowed' }}>
              analyzing...
            </button>
          )}
          {/* Dismiss */}
          {isOwner && (
            <button onClick={() => onDismiss(item.id)} style={{ padding: '5px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Contradictions() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(null) // id of item currently being analyzed
  const pollRef = useRef(null)
  const { user } = useAuth()
  const isOwner = user?.role === 'owner'

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const r = await api.get('/api/patterns/contradictions')
      setItems(r.data.contradictions || [])
      return r.data.contradictions || []
    } catch (e) { console.error(e) }
    finally { if (!silent) setLoading(false) }
    return []
  }

  useEffect(() => { load() }, [])

  // Clean up poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const analyze = async (id, force = false) => {
    try {
      setAnalyzing(id)
      await api.post(`/api/patterns/alerts/${id}/analyze${force ? '?force=true' : ''}`)

      // Poll every 3s until ai_analysis populates for this item
      let elapsed = 0
      pollRef.current = setInterval(async () => {
        elapsed += 3
        if (elapsed >= 90) {
          clearInterval(pollRef.current)
          pollRef.current = null
          setAnalyzing(null)
          return
        }
        const updated = await load(true)
        const target = updated.find(i => i.id === id)
        if (target?.ai_analysis) {
          clearInterval(pollRef.current)
          pollRef.current = null
          setAnalyzing(null)
        }
      }, 3000)
    } catch (e) {
      console.error(e)
      setAnalyzing(null)
    }
  }

  const dismiss = async (id) => {
    try {
      await api.post(`/api/patterns/alerts/${id}/acknowledge`)
      setItems(prev => prev.filter(i => i.id !== id))
    } catch (e) { console.error(e) }
  }

  const cancelAnalysis = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setAnalyzing(null)
  }

  return (
    <div>
      <AnalyzingModal visible={analyzing !== null} onClose={cancelAnalysis} />
      <PageHeader title="Contradictions" subtitle={`${items.length} flagged statement pairs`} />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono', fontSize: 12 }}>loading...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⊕</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, fontFamily: 'IBM Plex Mono' }}>no contradictions flagged</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 6 }}>Run pattern detection to scan for contradictions</div>
        </div>
      ) : items.map(item => (
        <ContradictionCard key={item.id} item={item} onAnalyze={analyze} onDismiss={dismiss} isOwner={isOwner} analyzing={analyzing} />
      ))}
    </div>
  )
}

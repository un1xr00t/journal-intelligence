import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

const BRANCH_LABELS = {
  safety:    '🛡 Safety',
  children:  '👶 Children',
  financial: '💰 Financial',
  housing:   '🏠 Housing',
  pets:      '🐾 Pets',
}

const STATUS_META = {
  done:    { label: 'Done',        bg: '#dcfce7', color: '#166534' },
  doing:   { label: 'In progress', bg: '#dbeafe', color: '#1e40af' },
  next:    { label: 'Up next',     bg: '#fef9c3', color: '#854d0e' },
  skipped: { label: 'Skipped',     bg: '#f3f4f6', color: '#6b7280' },
  backlog: { label: 'Pending',     bg: '#f3f4f6', color: '#6b7280' },
}

const PRIORITY_DOT = {
  critical: '#ef4444',
  high:     '#f59e0b',
  normal:   '#6366f1',
  low:      '#9ca3af',
}

const base = {
  minHeight: '100vh',
  background: '#f8fafc',
  fontFamily: "'DM Sans', -apple-system, sans-serif",
  color: '#111',
}

function ProgressBar({ value, height = 8, color = '#6366f1' }) {
  return (
    <div style={{ background: '#e5e7eb', borderRadius: 99, height, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.round(value * 100)}%`,
        height: '100%',
        background: color,
        borderRadius: 99,
        transition: 'width 0.4s ease',
      }} />
    </div>
  )
}

function PhaseCard({ phase }) {
  const [open, setOpen] = useState(phase.status === 'active')

  const accentColor = phase.status === 'complete' ? '#16a34a'
                    : phase.status === 'active'   ? '#6366f1'
                    :                               '#9ca3af'

  return (
    <div style={{
      border: `1px solid ${phase.status === 'active' ? '#c7d2fe' : '#e5e7eb'}`,
      borderRadius: 12,
      marginBottom: 12,
      background: '#fff',
      overflow: 'hidden',
    }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px',
          cursor: 'pointer',
          background: phase.status === 'active' ? '#eef2ff' : '#fafafa',
          borderBottom: open ? '1px solid #e5e7eb' : 'none',
          userSelect: 'none',
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#111' }}>
            Phase {phase.phase_order}: {phase.title}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
            {phase.done_count} of {phase.task_count} tasks complete
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 80 }}>
            <ProgressBar value={phase.progress} height={5} color={accentColor} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: accentColor, minWidth: 32, textAlign: 'right' }}>
            {Math.round(phase.progress * 100)}%
          </div>
          <div style={{ color: '#9ca3af', fontSize: 11 }}>{open ? '▲' : '▼'}</div>
        </div>
      </div>

      {open && (
        <div style={{ padding: '10px 18px 14px' }}>
          {phase.tasks.length === 0 && (
            <div style={{ color: '#9ca3af', fontSize: 13, padding: '8px 0' }}>No tasks in this phase.</div>
          )}
          {phase.tasks.map((task, i) => {
            const sm  = STATUS_META[task.status] || STATUS_META.backlog
            const dot = PRIORITY_DOT[task.priority] || PRIORITY_DOT.normal
            return (
              <div key={task.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '8px 0',
                borderBottom: i < phase.tasks.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}>
                <div style={{ marginTop: 5, width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 14, color: '#374151', lineHeight: 1.45 }}>{task.title}</div>
                <div style={{
                  fontSize: 11, padding: '2px 9px', borderRadius: 99,
                  background: sm.bg, color: sm.color,
                  fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap',
                }}>
                  {sm.label}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Passphrase gate ──────────────────────────────────────────────────────────

function PassphraseGate({ token, onSuccess }) {
  const [passphrase, setPassphrase]   = useState('')
  const [verifying,  setVerifying]    = useState(false)
  const [error,      setError]        = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const submit = async () => {
    if (!passphrase.trim()) return
    setVerifying(true)
    setError(null)
    try {
      const r = await fetch(`/api/share/verify/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: passphrase.trim() }),
      })
      const data = await r.json()
      if (r.status === 401) { setError('Incorrect passphrase. Please check and try again.'); setVerifying(false); return }
      if (r.status === 404) { setError('This link has been revoked or does not exist.'); setVerifying(false); return }
      if (r.status === 410) { setError('This link has expired.'); setVerifying(false); return }
      if (r.status === 429) { setError('Too many attempts. Please wait a few minutes.'); setVerifying(false); return }
      if (!r.ok)            { setError('Verification failed. Please try again.'); setVerifying(false); return }
      // Cache session token in sessionStorage so page refreshes don't re-prompt
      sessionStorage.setItem(`share_session_${token}`, data.session_token)
      onSuccess(data.session_token)
    } catch {
      setError('Network error. Please try again.')
      setVerifying(false)
    }
  }

  return (
    <div style={{ ...base, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{
        background: '#fff', border: '1px solid #e5e7eb',
        borderRadius: 16, padding: '40px 40px 36px',
        maxWidth: 440, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      }}>
        {/* Header */}
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 16, color: '#6366f1', letterSpacing: '0.05em', marginBottom: 24 }}>
          ✦ Journal Intelligence
        </div>

        <div style={{ fontSize: 28, marginBottom: 12 }}>🔐</div>
        <div style={{ fontWeight: 700, fontSize: 18, color: '#111', marginBottom: 8 }}>
          Passphrase required
        </div>
        <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 28, lineHeight: 1.6 }}>
          This exit plan is passphrase-protected. Enter the passphrase you were given to view it.
        </div>

        <input
          ref={inputRef}
          type="text"
          value={passphrase}
          onChange={e => setPassphrase(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !verifying && submit()}
          placeholder="e.g. violet-storm-cedar-4729"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck="false"
          style={{
            width: '100%', padding: '12px 14px', fontSize: 15,
            background: '#f8fafc', border: `1.5px solid ${error ? '#fca5a5' : '#e5e7eb'}`,
            borderRadius: 10, color: '#111', outline: 'none',
            fontFamily: 'monospace', letterSpacing: '0.04em',
            boxSizing: 'border-box', marginBottom: 12,
            transition: 'border-color 0.15s',
          }}
        />

        {error && (
          <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>✕</span> {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={verifying || !passphrase.trim()}
          style={{
            width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 700,
            background: verifying || !passphrase.trim() ? '#a5b4fc' : '#6366f1',
            color: '#fff', border: 'none', borderRadius: 10,
            cursor: verifying || !passphrase.trim() ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {verifying ? 'Verifying…' : 'Access plan'}
        </button>

        <div style={{ marginTop: 20, fontSize: 12, color: '#9ca3af', textAlign: 'center', lineHeight: 1.6 }}>
          The passphrase was shared with you by the plan owner.<br />
          No account is required to view this plan.
        </div>
      </div>
    </div>
  )
}

// ── Plan view ────────────────────────────────────────────────────────────────

function PlanView({ plan }) {
  const pct     = Math.round(plan.overall_progress * 100)
  const expires = new Date(plan.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const updated = new Date(plan.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div style={base}>
      {/* Header */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e5e7eb',
        padding: '18px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 10,
      }}>
        <div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 17, color: '#6366f1', letterSpacing: '0.05em' }}>
            ✦ Journal Intelligence
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
            Exit Plan — read-only view
            {plan.share_label && (
              <span style={{ color: '#374151', fontWeight: 600 }}> · {plan.share_label}</span>
            )}
          </div>
        </div>
        <div style={{
          background: '#eef2ff', color: '#4338ca',
          borderRadius: 99, padding: '4px 14px',
          fontSize: 12, fontWeight: 600,
        }}>
          {plan.plan_type_label}
        </div>
      </div>

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 24px' }}>

        {/* Progress card */}
        <div style={{
          background: '#fff', border: '1px solid #e5e7eb',
          borderRadius: 14, padding: '22px 26px', marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Overall progress</div>
            <div style={{ fontWeight: 700, fontSize: 26, color: '#6366f1' }}>{pct}%</div>
          </div>
          <ProgressBar value={plan.overall_progress} height={10} color="#6366f1" />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: '#9ca3af', flexWrap: 'wrap', gap: 4 }}>
            <span>{plan.done_tasks} of {plan.total_tasks} tasks complete</span>
            <span>Last updated {updated}</span>
          </div>
        </div>

        {/* Branches */}
        {plan.branches.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
              Active areas
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {plan.branches.map(b => (
                <span key={b} style={{
                  background: '#f1f5f9', color: '#334155',
                  borderRadius: 99, padding: '5px 14px',
                  fontSize: 13, fontWeight: 500,
                }}>
                  {BRANCH_LABELS[b] || b}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Phases */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
            Plan phases
          </div>
          {plan.phases.map(ph => <PhaseCard key={ph.id} phase={ph} />)}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 40, paddingTop: 20,
          borderTop: '1px solid #e5e7eb',
          textAlign: 'center', fontSize: 11, color: '#9ca3af', lineHeight: 1.8,
        }}>
          Read-only snapshot shared via Journal Intelligence.<br />
          No journal entries, notes, or personal contacts are included.<br />
          Link expires {expires}.
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ExitPlanShareView() {
  const { token } = useParams()

  // phase: 'gate' | 'loading' | 'plan' | 'error'
  const [phase,         setPhase]        = useState('gate')
  const [plan,          setPlan]         = useState(null)
  const [error,         setError]        = useState(null)

  const loadPlan = (sessionToken) => {
    setPhase('loading')
    fetch(`/api/share/plan/${token}`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` },
    })
      .then(r => {
        if (r.status === 401) {
          // Session token invalid or passphrase_required — back to gate
          sessionStorage.removeItem(`share_session_${token}`)
          setPhase('gate')
          return null
        }
        if (r.status === 404) throw new Error('This link has been revoked or does not exist.')
        if (r.status === 410) throw new Error('This link has expired.')
        if (r.status === 429) throw new Error('Too many requests. Try again in a few minutes.')
        if (!r.ok)            throw new Error('Failed to load plan.')
        return r.json()
      })
      .then(data => {
        if (!data) return
        setPlan(data)
        setPhase('plan')
      })
      .catch(e => {
        setError(e.message)
        setPhase('error')
      })
  }

  // On mount — try cached session from sessionStorage
  useEffect(() => {
    const cached = sessionStorage.getItem(`share_session_${token}`)
    if (cached) {
      loadPlan(cached)
    }
    // else: stay in 'gate' phase
  }, [token])

  if (phase === 'gate') {
    return <PassphraseGate token={token} onSuccess={loadPlan} />
  }

  if (phase === 'loading') {
    return (
      <div style={{ ...base, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#9ca3af', fontSize: 14 }}>Loading…</div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div style={{ ...base, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{
          background: '#fff', border: '1px solid #e5e7eb',
          borderRadius: 14, padding: '40px 48px',
          textAlign: 'center', maxWidth: 420,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Link unavailable</div>
          <div style={{ color: '#6b7280', fontSize: 14 }}>{error}</div>
        </div>
      </div>
    )
  }

  return <PlanView plan={plan} />
}

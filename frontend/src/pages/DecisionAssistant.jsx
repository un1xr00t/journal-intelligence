import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import WarRoomContextBanner from '../components/WarRoomContextBanner'
import api from '../services/api'

const GOALS = [
  { key: 'protect_peace',         label: 'Protect my peace',                   icon: '◌' },
  { key: 'get_clarity',           label: 'Get clarity',                         icon: '◎' },
  { key: 'reduce_conflict',       label: 'Reduce conflict',                     icon: '⬡' },
  { key: 'stay_safe',             label: 'Stay safe',                           icon: '◈' },
  { key: 'preserve_relationship', label: 'Preserve the relationship (if possible)', icon: '◉' },
  { key: 'prepare_before_acting', label: 'Prepare before acting',               icon: '▷' },
]

const RISK_COLOR = {
  low:    '#22c55e',
  medium: '#f59e0b',
  high:   '#ef4444',
}

const TYPE_BADGE = {
  'lowest-risk': { label: 'Lowest Risk',  color: '#22c55e' },
  balanced:      { label: 'Balanced',     color: '#6366f1' },
  decisive:      { label: 'Most Decisive',color: '#f59e0b' },
}

function RiskPip({ level }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 8, height: 8, borderRadius: '50%',
      background: RISK_COLOR[level] || 'var(--text-muted)',
      marginRight: 4,
      verticalAlign: 'middle',
    }} />
  )
}

function Level({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 12, fontFamily: 'IBM Plex Mono', color: color || RISK_COLOR[value] || 'var(--text-muted)', textTransform: 'uppercase' }}>
        {value}
      </span>
    </div>
  )
}

function OptionCard({ opt, onExpand, isSaved, onSave, saving }) {
  const badge = TYPE_BADGE[opt.type] || {}
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      cursor: 'pointer',
      transition: 'border-color 0.15s, transform 0.15s',
    }}
    onClick={() => onExpand(opt)}
    onMouseEnter={e => { e.currentTarget.style.borderColor = badge.color || 'var(--accent)' }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      {/* Badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: `${badge.color}18`,
        border: `1px solid ${badge.color}44`,
        borderRadius: 6, padding: '3px 9px',
        alignSelf: 'flex-start',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: badge.color, display: 'inline-block' }} />
        <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: badge.color, fontWeight: 600 }}>
          {badge.label}
        </span>
      </div>

      {/* Title */}
      <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.3 }}>
        {opt.title}
      </div>

      {/* Summary */}
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {opt.summary}
      </div>

      {/* Quick metrics */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Level label="Risk" value={opt.risk_level} />
        <Level label="Emotional cost" value={opt.emotional_cost_level} />
        <Level label="Effort" value={opt.practical_effort} />
        <Level label="Reversible" value={opt.reversibility} color="var(--text-muted)" />
      </div>

      {/* 48h outlook */}
      <div style={{
        background: 'var(--bg-base)',
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 12,
        color: 'var(--text-muted)',
        lineHeight: 1.5,
      }}>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Next 48h — </span>
        {opt.next_48h}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <button
          onClick={e => { e.stopPropagation(); onExpand(opt) }}
          style={{
            flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 600,
            background: 'var(--bg-base)', color: 'var(--text-secondary)',
            border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
          }}
        >
          Full breakdown →
        </button>
        <button
          onClick={e => { e.stopPropagation(); onSave(opt) }}
          disabled={saving || isSaved}
          style={{
            padding: '8px 14px', fontSize: 12, fontWeight: 600,
            background: isSaved ? '#22c55e22' : 'transparent',
            color: isSaved ? '#22c55e' : 'var(--text-muted)',
            border: `1px solid ${isSaved ? '#22c55e44' : 'var(--border)'}`,
            borderRadius: 8, cursor: isSaved ? 'default' : 'pointer',
          }}
        >
          {isSaved ? '✓ Saved' : saving ? '…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function ExpandedOption({ opt, onClose, onSave, isSaved, saving, onGenerateScript, onAddToChecklist, onDelete, isDeleting }) {
  const badge = TYPE_BADGE[opt.type] || {}
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '32px 16px',
      overflowY: 'auto',
    }}
    onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          maxWidth: 680,
          width: '100%',
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: `${badge.color}18`,
              border: `1px solid ${badge.color}44`,
              borderRadius: 6, padding: '3px 9px', marginBottom: 8,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: badge.color, display: 'inline-block' }} />
              <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: badge.color, fontWeight: 600 }}>
                {badge.label}
              </span>
            </div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--text-primary)', lineHeight: 1.3 }}>
              {opt.title}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer', padding: 4 }}>✕</button>
        </div>

        {/* Summary */}
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{opt.summary}</p>

        {/* Why it fits */}
        <div style={{ background: 'var(--bg-base)', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: badge.color, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Why this fits your situation
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{opt.why_it_fits}</p>
        </div>

        {/* Past pattern */}
        {opt.past_pattern_note && (
          <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: '#6366f1', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              From your journal history
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{opt.past_pattern_note}</p>
          </div>
        )}

        {/* Metrics grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'Risk level', value: opt.risk_level, colored: true },
            { label: 'Reversibility', value: opt.reversibility },
            { label: 'Practical effort', value: opt.practical_effort, colored: true },
            { label: 'Emotional cost', value: opt.emotional_cost_level, colored: true },
          ].map(({ label, value, colored }) => (
            <div key={label} style={{ background: 'var(--bg-base)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
              <div style={{
                fontSize: 14, fontFamily: 'IBM Plex Mono', fontWeight: 700, textTransform: 'uppercase',
                color: colored ? (RISK_COLOR[value] || 'var(--text-secondary)') : 'var(--text-secondary)',
              }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Emotional cost explanation */}
        {opt.emotional_cost_explanation && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, paddingLeft: 12, borderLeft: '2px solid var(--border)' }}>
            {opt.emotional_cost_explanation}
          </div>
        )}

        {/* Timelines */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ background: 'var(--bg-base)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
              Next 48 hours
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{opt.next_48h}</p>
          </div>
          <div style={{ background: 'var(--bg-base)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
              Next 30 days
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{opt.next_30d}</p>
          </div>
        </div>

        {/* Best if / Avoid if */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ borderLeft: '3px solid #22c55e', paddingLeft: 12 }}>
            <div style={{ fontSize: 11, color: '#22c55e', marginBottom: 4, fontFamily: 'IBM Plex Mono', textTransform: 'uppercase' }}>Best if</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{opt.best_if}</div>
          </div>
          <div style={{ borderLeft: '3px solid #ef444488', paddingLeft: 12 }}>
            <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 4, fontFamily: 'IBM Plex Mono', textTransform: 'uppercase' }}>Avoid if</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{opt.avoid_if}</div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
          {onDelete ? (
            <button
              onClick={onDelete}
              disabled={isDeleting}
              style={{
                padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: isDeleting ? 'default' : 'pointer',
                background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.3)',
              }}
            >
              {isDeleting ? 'Deleting…' : 'Delete saved option'}
            </button>
          ) : (
            <button
              onClick={() => onSave(opt)}
              disabled={saving || isSaved}
              style={{
                padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: isSaved ? 'default' : 'pointer',
                background: isSaved ? '#22c55e22' : 'var(--accent)',
                color: isSaved ? '#22c55e' : '#000',
                border: isSaved ? '1px solid #22c55e44' : 'none',
              }}
            >
              {isSaved ? '✓ Saved' : saving ? 'Saving…' : 'Save this option'}
            </button>
          )}
          <button
            onClick={() => onGenerateScript(opt)}
            style={{
              padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
              background: 'var(--bg-base)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
            }}
          >
            Generate script
          </button>
          <button
            onClick={() => onAddToChecklist(opt)}
            style={{
              padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
              background: 'var(--bg-base)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
            }}
          >
            Convert to checklist
          </button>
        </div>

        {/* Disclaimer */}
        <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0, opacity: 0.7 }}>
          This is not legal, medical, or professional advice. These options are generated from your personal journal history to help you think through tradeoffs.
        </p>
      </div>
    </div>
  )
}

function ScriptModal({ opt, onClose }) {
  const [script, setScript] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    setLoading(true)
    try {
      const r = await api.post('/api/journal/decide/script', {
        option_title: opt.title,
        option_summary: opt.summary,
        why_it_fits: opt.why_it_fits,
      })
      setScript(r.data.script)
    } catch {
      setScript('Could not generate script. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const copy = () => {
    navigator.clipboard.writeText(script)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 600,
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}
    onClick={onClose}
    >
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, maxWidth: 600, width: '100%', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
            Script for: {opt.title}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        {!script && !loading && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
              Generate a suggested script or message you could use when taking this approach.
            </p>
            <button onClick={generate} style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Generate script
            </button>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Writing…
          </div>
        )}

        {script && (
          <>
            <textarea
              value={script}
              onChange={e => setScript(e.target.value)}
              rows={8}
              style={{
                width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)',
                borderRadius: 8, padding: 14, fontSize: 13, color: 'var(--text-primary)',
                fontFamily: 'inherit', lineHeight: 1.7, resize: 'vertical', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <button onClick={copy} style={{ alignSelf: 'flex-end', background: copied ? '#22c55e22' : 'var(--bg-base)', color: copied ? '#22c55e' : 'var(--text-secondary)', border: `1px solid ${copied ? '#22c55e44' : 'var(--border)'}`, borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function ChecklistModal({ opt, onClose }) {
  const steps = [
    `Review: "${opt.title}"`,
    opt.next_48h,
    opt.next_30d,
    `Reassess after 48 hours`,
  ].filter(Boolean)

  const [checked, setChecked] = useState(steps.map(() => false))
  const [copied, setCopied] = useState(false)

  const toggle = i => setChecked(prev => prev.map((v, idx) => idx === i ? !v : v))

  const copyText = () => {
    const text = steps.map((s, i) => `[${checked[i] ? 'x' : ' '}] ${s}`).join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, maxWidth: 500, width: '100%', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>Checklist</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {steps.map((step, i) => (
            <div
              key={i}
              onClick={() => toggle(i)}
              style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                background: 'var(--bg-base)', borderRadius: 8, padding: '10px 14px',
                cursor: 'pointer', opacity: checked[i] ? 0.5 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              <span style={{
                width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked[i] ? 'var(--accent)' : 'var(--border)'}`,
                background: checked[i] ? 'var(--accent)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 1, fontSize: 11, color: '#000',
              }}>
                {checked[i] ? '✓' : ''}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, textDecoration: checked[i] ? 'line-through' : 'none' }}>
                {step}
              </span>
            </div>
          ))}
        </div>
        <button onClick={copyText} style={{ alignSelf: 'flex-end', background: 'var(--bg-base)', color: copied ? '#22c55e' : 'var(--text-secondary)', border: `1px solid ${copied ? '#22c55e44' : 'var(--border)'}`, borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          {copied ? '✓ Copied' : 'Copy as text'}
        </button>
      </div>
    </div>
  )
}

export default function DecisionAssistant() {
  const [step, setStep] = useState('goal')      // goal | context | loading | results | saved
  const [selectedGoal, setSelectedGoal] = useState(null)
  const [contextHint, setContextHint] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [scriptOpt, setScriptOpt] = useState(null)
  const [checklistOpt, setChecklistOpt] = useState(null)
  const [savedIds, setSavedIds] = useState(new Set())
  const [savingId, setSavingId] = useState(null)
  const [viewSaved, setViewSaved] = useState(false)
  const [savedList, setSavedList] = useState([])
  const [savedLoading, setSavedLoading] = useState(false)
  const [expandedSaved, setExpandedSaved] = useState(null)   // { opt, id } for saved modal
  const [deletingId, setDeletingId] = useState(null)

  // War Room pre-fill
  useEffect(() => {
    const warRoomPrefill = window.history.state?.usr?.warRoomItem
    if (warRoomPrefill) {
      const hint = warRoomPrefill.why
        ? warRoomPrefill.title + ': ' + warRoomPrefill.why
        : warRoomPrefill.title
      setContextHint(hint)
    }
  }, [])

  const run = async () => {
    setStep('loading')
    setError(null)
    setResult(null)
    try {
      const r = await api.post('/api/journal/decide', {
        goal: selectedGoal,
        context_hint: contextHint.trim() || undefined,
      })
      setResult(r.data)
      setStep('results')
    } catch (e) {
      setError(e.response?.data?.detail || 'Something went wrong. Please try again.')
      setStep('goal')
    }
  }

  const handleSave = async (opt) => {
    const key = opt.type
    if (savedIds.has(key)) return
    setSavingId(key)
    try {
      await api.post('/api/journal/decide/save', {
        goal: result?.goal || '',
        option_type: opt.type,
        title: opt.title,
        full_json: JSON.stringify(opt),
      })
      setSavedIds(prev => new Set([...prev, key]))
    } catch {
      // silent fail — user sees nothing change
    } finally {
      setSavingId(null)
    }
  }

  const loadSaved = async () => {
    setSavedLoading(true)
    try {
      const r = await api.get('/api/journal/decide/saved')
      setSavedList(r.data.decisions || [])
    } catch {
      setSavedList([])
    } finally {
      setSavedLoading(false)
    }
    setViewSaved(true)
  }

  const deleteSaved = async (id) => {
    setDeletingId(id)
    try {
      await api.delete(`/api/journal/decide/saved/${id}`)
      setSavedList(prev => prev.filter(d => d.id !== id))
      setExpandedSaved(null)
    } catch {
      // silent
    } finally {
      setDeletingId(null)
    }
  }

  const reset = () => {
    setStep('goal')
    setSelectedGoal(null)
    setContextHint('')
    setResult(null)
    setError(null)
    setSavedIds(new Set())
    setViewSaved(false)
  }

  // ── Saved view ─────────────────────────────────────────────────────────────
  if (viewSaved) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <WarRoomContextBanner />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <button onClick={() => setViewSaved(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer', padding: 0 }}>←</button>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22, color: 'var(--text-primary)', margin: 0 }}>Saved Decisions</h1>
        </div>
        {savedLoading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</div>
        ) : savedList.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No saved decisions yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {savedList.map(d => {
              let parsed = null
              try { parsed = JSON.parse(d.full_json) } catch {}
              const badge = TYPE_BADGE[d.option_type] || {}
              return (
                <div
                  key={d.id}
                  onClick={() => parsed && setExpandedSaved({ opt: parsed, id: d.id })}
                  style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
                    padding: 18, display: 'flex', flexDirection: 'column', gap: 8,
                    cursor: parsed ? 'pointer' : 'default',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => { if (parsed) e.currentTarget.style.borderColor = badge.color || 'var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: badge.color, marginRight: 8 }}>{badge.label}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>{d.title}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>
                      {d.created_at?.slice(0, 10)}
                    </span>
                  </div>
                  {parsed?.summary && <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{parsed.summary}</p>}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Click to view full breakdown →</div>
                </div>
              )
            })}
          </div>
        )}

        {/* Expanded modal for saved decision — delete instead of save */}
        {expandedSaved && (
          <ExpandedOption
            opt={expandedSaved.opt}
            onClose={() => setExpandedSaved(null)}
            onSave={() => {}}
            isSaved={true}
            saving={false}
            onGenerateScript={(o) => { setExpandedSaved(null); setScriptOpt(o) }}
            onAddToChecklist={(o) => { setExpandedSaved(null); setChecklistOpt(o) }}
            onDelete={() => deleteSaved(expandedSaved.id)}
            isDeleting={deletingId === expandedSaved.id}
          />
        )}
        {scriptOpt && <ScriptModal opt={scriptOpt} onClose={() => setScriptOpt(null)} />}
        {checklistOpt && <ChecklistModal opt={checklistOpt} onClose={() => setChecklistOpt(null)} />}
      </div>
    )
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div style={{ maxWidth: 560, margin: '80px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 16, color: 'var(--accent)', animation: 'spin 2s linear infinite', display: 'inline-block' }}>◎</div>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', marginBottom: 8 }}>
          Reading your journal…
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Searching for patterns relevant to your situation. This usually takes 10–20 seconds.
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ── Results ────────────────────────────────────────────────────────────────
  if (step === 'results' && result) {
    return (
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              Help Me Choose
            </h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Goal: <span style={{ color: 'var(--text-secondary)' }}>{result.goal_label}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={loadSaved} style={{ fontSize: 12, padding: '7px 14px', background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Saved
            </button>
            <button onClick={reset} style={{ fontSize: 12, padding: '7px 14px', background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Start over
            </button>
          </div>
        </div>

        {/* History summary */}
        {result.history_summary && (
          <div style={{
            background: 'rgba(99,102,241,0.06)',
            border: '1px solid rgba(99,102,241,0.18)',
            borderRadius: 12, padding: '14px 18px',
            marginBottom: 24,
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <span style={{ color: '#6366f1', fontSize: 18, flexShrink: 0, marginTop: 1 }}>◉</span>
            <div>
              <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: '#6366f1', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Based on your journal
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{result.history_summary}</p>
            </div>
          </div>
        )}

        {/* Options grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {(result.options || []).map(opt => (
            <OptionCard
              key={opt.type}
              opt={opt}
              onExpand={setExpanded}
              isSaved={savedIds.has(opt.type)}
              onSave={handleSave}
              saving={savingId === opt.type}
            />
          ))}
        </div>

        {/* Modals */}
        {expanded && (
          <ExpandedOption
            opt={expanded}
            onClose={() => setExpanded(null)}
            onSave={handleSave}
            isSaved={savedIds.has(expanded.type)}
            saving={savingId === expanded.type}
            onGenerateScript={(o) => { setExpanded(null); setScriptOpt(o) }}
            onAddToChecklist={(o) => { setExpanded(null); setChecklistOpt(o) }}
          />
        )}
        {scriptOpt && <ScriptModal opt={scriptOpt} onClose={() => setScriptOpt(null)} />}
        {checklistOpt && <ChecklistModal opt={checklistOpt} onClose={() => setChecklistOpt(null)} />}
      </div>
    )
  }

  // ── Goal selection ─────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24, color: 'var(--text-primary)', marginBottom: 6 }}>
          Help Me Choose
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          Not advice. A structured comparison of your real options — grounded in your own journal history.
        </p>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#ef4444' }}>
          {error}
        </div>
      )}

      {/* Goal question */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 14 }}>
          What matters most right now?
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {GOALS.map(g => (
            <button
              key={g.key}
              onClick={() => setSelectedGoal(g.key)}
              style={{
                background: selectedGoal === g.key ? 'rgba(var(--accent-rgb,99,102,241),0.12)' : 'var(--bg-card)',
                border: `1px solid ${selectedGoal === g.key ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 10,
                padding: '12px 14px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex', gap: 10, alignItems: 'center',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <span style={{ color: selectedGoal === g.key ? 'var(--accent)' : 'var(--text-muted)', fontSize: 16, flexShrink: 0 }}>{g.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: selectedGoal === g.key ? 'var(--text-primary)' : 'var(--text-secondary)', lineHeight: 1.4 }}>
                {g.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Context hint */}
      {selectedGoal && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
            Briefly describe what you're dealing with right now <span style={{ opacity: 0.6 }}>(optional — helps ground the analysis)</span>
          </label>
          <textarea
            value={contextHint}
            onChange={e => setContextHint(e.target.value)}
            placeholder="e.g. I need to decide whether to respond to a message I received this morning…"
            rows={3}
            style={{
              width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--text-primary)',
              fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={run}
          disabled={!selectedGoal}
          style={{
            padding: '11px 28px', fontSize: 14, fontWeight: 700, borderRadius: 10, cursor: selectedGoal ? 'pointer' : 'not-allowed',
            background: selectedGoal ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
            color: selectedGoal ? '#000' : 'var(--text-muted)',
            border: 'none', transition: 'all 0.15s',
          }}
        >
          Think this through →
        </button>
        <button
          onClick={loadSaved}
          style={{
            padding: '11px 18px', fontSize: 13, fontWeight: 600, borderRadius: 10, cursor: 'pointer',
            background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)',
          }}
        >
          View saved
        </button>
      </div>

      {/* Info blurb */}
      <div style={{ marginTop: 32, padding: '14px 18px', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          How this works
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, margin: 0 }}>
          This tool generates 3 distinct options — lowest-risk, balanced, and decisive — each grounded in patterns
          from your own journal entries. It's not advice. It's a structured way to see your real tradeoffs clearly,
          based on what you've actually experienced.
        </p>
      </div>
    </div>
  )
}
